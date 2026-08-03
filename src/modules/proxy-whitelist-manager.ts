/**
 * 通过 Telegram 增删 clash 白名单规则。
 *
 * 规则存在 proxy-transformer Worker 的 D1 里，Worker 把它渲染成一个 classical
 * rule-provider 供路由器订阅。路由器每次来拉取时 Worker 会记下它取到了第几版，
 * 所以「规则真的生效了」这件事可以被确认——bot 写入后拿到版本号 N，轮询到
 * served.version >= N 即为送达。
 *
 * 权限：superusers 里放的是群 id，只有这些群里发的命令有效；私聊 chat.id 是正数，
 * 不会落在群 id 列表里，因此「私聊无反应」是这条规则的自然结果，无需单独判断。
 *
 * 并发：TypedEvent 的 dispatch 不 await 订阅者，因此多条命令天然并行，各自持有
 * 自己那条命令消息的 id，👀 各清各的。版本号单调递增，A 等 v5、B 等 v6，路由器
 * 拉到 v6 时两边的 `served.version >= N` 同时成立，各自正确收尾。
 */

import got from 'got'
import * as tt from 'telegraf/typings/telegram-types'
import { TelegrafContext } from 'telegraf/typings/context'
import { Message } from 'telegram-typings'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import persistConfig from '../utils/persistConfig'
import telemetry from '../utils/telemetry'
import { sleep } from '../utils/lang'
import { TelegramBotName } from '../utils/type'

const configs = persistConfig.entries.proxyWhitelistManager

type Bot = ReturnType<typeof getTelegramBotByAnyBotName>
type Config = typeof configs[TelegramBotName]

// classical rule-provider 的 payload 不承载规则去向，去向由主配置的
// `RULE-SET,<name>,<策略组>` 指定，所以任何面向用户的文案都不该出现策略组名
const RULE_TYPE = 'DOMAIN-SUFFIX'
const EYES = '👀'
const SEARCH_LIMIT = 10

// rule-provider 的 interval 是 60 秒，比这更密的轮询不会更快拿到回执
const SERVED_POLL_INTERVAL = 15 * 1000
const SERVED_TIMEOUT = 5 * 60 * 1000
const PENDING_TTL = 5 * 60 * 1000
const REQUEST_TIMEOUT = 20 * 1000

const TIMEOUT_TEXT = '未收到规则更新成功消息，请联系技术支持协助排查'

// ---------- 文本渲染 ----------

const MD: { parse_mode: tt.ParseMode } = { parse_mode: 'MarkdownV2' }

/**
 * 包成 MarkdownV2 代码块。
 *
 * 裸文本里 MarkdownV2 要转义 18 个字符（_*[]()~`>#+-=|{}.!），漏一个整条消息就发不出去；
 * 而代码块内只需转义反引号与反斜杠。DOMAIN-SUFFIX 的连字符、reason 的下划线、
 * 用法提示里的尖括号全都靠这个规避，顺带拿到等宽效果。
 * 所有变量插值一律走这里，固定文案则已逐条核对不含特殊字符。
 */
const code = (text: string) => '`' + text.replace(/[`\\]/g, '\\$&') + '`'

const ruleText = (domain: string) => code(`${RULE_TYPE}, ${domain}`)

// ---------- 域名 ----------

// 不用 lookbehind，避免 babel 转译后的兼容问题
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

const normalizeDomain = (input: string): string | null => {
  const v = input.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
  if (v.length < 1 || v.length > 253) return null
  const parts = v.split('.')
  if (parts.length < 2) return null
  return parts.every((p) => DOMAIN_LABEL.test(p)) ? v : null
}

// ---------- Worker 客户端 ----------

type AdminError = { ok: false; reason: string }
type Rule = {
  id: number
  type: string
  value: string
  created_at: number
  created_by: string | null
}
type StatusBody =
  | { ok: true; version: number; served: { version: number; at: number } | null }
  | AdminError
type SearchBody = { ok: true; matches: Rule[]; total: number; limit: number } | AdminError
type RuleBody = { ok: true; rule: Rule | null } | AdminError
type MutateBody = { ok: true; version: number } | AdminError

/** 配置里可能只写了主机名，这里补全协议并去掉尾部斜杠 */
const normalizeBaseUrl = (raw: string) =>
  (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '')

const call = async <T>(
  config: Config,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  opts: {
    searchParams?: Record<string, string | number>
    json?: Record<string, unknown>
  } = {}
): Promise<{ status: number; body: T | null }> => {
  try {
    // 非 2xx 的 body 才是有用信息（409 会带 reason），所以自己判状态码
    const res = await got<T>(normalizeBaseUrl(config.baseUrl) + path, {
      method,
      headers: { authorization: `Bearer ${config.adminToken}` },
      searchParams: opts.searchParams,
      json: opts.json,
      responseType: 'json',
      throwHttpErrors: false,
      timeout: REQUEST_TIMEOUT,
      retry: { limit: 1 }
    })
    return { status: res.statusCode, body: res.body ?? null }
  } catch (error) {
    // body 不是 JSON 时 got 抛 ParseError，此时状态码仍挂在 error.response 上
    const status =
      (error as { response?: { statusCode?: number } })?.response?.statusCode ?? 0
    void telemetry(
      'modules/proxy-whitelist-manager.ts/call',
      `${method} ${path} 失败`,
      error
    )
    return { status, body: null }
  }
}

const REASON_TEXT: Record<string, string> = {
  already_exists: '该规则已存在',
  not_found: '未找到该规则',
  invalid_domain: '域名格式非法',
  unsupported_type: '不支持的规则类型',
  invalid_json: '请求体格式错误',
  unauthorized: 'Worker 拒绝了管理口令，检查 adminToken 配置'
}

const describeFailure = (status: number, body: unknown): string => {
  const reason = (body as AdminError | null)?.reason
  if (reason) return REASON_TEXT[reason] ?? `失败：${code(reason)}`
  if (status === 0) return '连接 Worker 失败，检查 baseUrl 与网络'
  return `Worker 返回 HTTP ${status}`
}

// ---------- Telegram 辅助 ----------

/**
 * telegraf 3.38 没有 setMessageReaction（那是 Bot API 7.0 才加的），
 * 但 callApi 是公开方法，可以直接打任意 Bot API 方法，且复用 telegraf 的
 * token、代理 agent 与节流器。传 null 表示清除。
 */
const setReaction = async (
  bot: Bot,
  chatId: number,
  messageId: number,
  emoji: string | null
) => {
  // reaction 失败（例如群里禁用了表情回应）不该中断主流程
  await bot.instance.telegram
    .callApi('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: emoji ? [{ type: 'emoji', emoji }] : []
    })
    .catch((error) =>
      telemetry('modules/proxy-whitelist-manager.ts/setReaction', '', error)
    )
}

/** 每一步都另发一条消息，既有消息一律不动——不编辑也不删除 */
const say = async (bot: Bot, chatId: number, text: string) => {
  await bot
    .sendMessage(chatId, text, MD)
    .catch((error) => telemetry('modules/proxy-whitelist-manager.ts/say', '', error))
}

/** 去掉命令本身与可能的尾部 @botname，剩下的就是参数 */
const extractArg = (text: string, username?: string): string => {
  let rest = text.replace(/^\/[A-Za-z0-9_]+(?:@[A-Za-z0-9_]+)?\s*/, '')
  if (username) rest = rest.replace(new RegExp(`@${username}$`), '')
  return rest.trim()
}

/**
 * 显式参数优先；命令本身没有参数时，把被回复消息的文本或说明文字作为参数。
 * 不拆分回复内容，search 可以接收包含空格的关键字，增删则继续交给域名校验。
 */
const extractCommandArg = (message: Message, username?: string): string => {
  const explicit = extractArg(message.text ?? '', username)
  if (explicit) return explicit

  const reply = message.reply_to_message
  return (reply?.text ?? reply?.caption ?? '').trim()
}

/**
 * 临时诊断群聊回复参数为什么缺失。telegram-typings 版本较旧，没有 quote 与
 * external_reply 的类型，但 Telegram 会把服务端返回的新字段原样保留在 update 中。
 */
const logReplyArgumentDebug = (
  message: Message,
  commandName: string,
  update: unknown
) => {
  const current = message as Message & {
    quote?: { text?: string }
    external_reply?: Record<string, unknown>
  }
  const reply = current.reply_to_message
  const rawUpdate = JSON.stringify(update) ?? ''
  // telemetry 每个参数最多保留 1000 字符，最终还要作为一条 Telegram 消息发送。
  // 留出 label 与结构化摘要的空间，原始 update 最多分 3 段记录 2400 字符。
  const rawLimit = 2400
  const chunkSize = 800
  const rawChunks = rawUpdate
    .slice(0, rawLimit)
    .match(new RegExp(`.{1,${chunkSize}}`, 'gs')) ?? []

  void telemetry(
    'modules/proxy-whitelist-manager.ts/reply-argument-debug',
    {
      commandName,
      commandText: current.text,
      messageId: current.message_id,
      chatId: current.chat.id,
      replyText: reply?.text,
      replyCaption: reply?.caption,
      quoteText: current.quote?.text,
      reply: reply
        ? {
            messageId: reply.message_id,
            entityTypes: reply.entities?.map((entity) => entity.type),
            captionEntityTypes: reply.caption_entities?.map((entity) => entity.type),
            keys: Object.keys(reply).sort()
          }
        : null,
      messageKeys: Object.keys(current).sort(),
      quote: current.quote ?? null,
      externalReplyKeys: current.external_reply
        ? Object.keys(current.external_reply).sort()
        : null,
      rawUpdateLength: rawUpdate.length,
      rawUpdateTruncated: rawUpdate.length > rawLimit
    },
    ...rawChunks.map(
      (chunk, index) => `rawUpdate[${index + 1}/${rawChunks.length}]:${chunk}`
    )
  )
}

/**
 * handler 顶层兜底。dispatch 不 await 订阅者，异常连 unhandledRejection 都没人管，
 * 而 👀 是在流程开头挂上的——中途抛错就会永久残留。这里强制收尾。
 */
const guard = async (
  bot: Bot,
  chatId: number,
  commandMessageId: number,
  run: () => Promise<void>
) => {
  try {
    await run()
  } catch (error) {
    void telemetry(
      'modules/proxy-whitelist-manager.ts/guard',
      '命令处理异常',
      error
    )
    await setReaction(bot, chatId, commandMessageId, null)
    await bot
      .sendMessage(chatId, '处理命令时发生意外错误，已记录日志', MD)
      .catch(() => undefined)
  }
}

// ---------- 送达回执 ----------

const waitForServed = async (config: Config, targetVersion: number): Promise<boolean> => {
  const deadline = Date.now() + SERVED_TIMEOUT
  while (Date.now() < deadline) {
    const { body } = await call<StatusBody>(config, 'GET', '/admin/status', {
      searchParams: { identityTag: config.identityTag }
    })
    if (body && body.ok && body.served && body.served.version >= targetVersion) {
      return true
    }
    await sleep(SERVED_POLL_INTERVAL)
  }
  return false
}

// ---------- 增删主流程 ----------

const runMutation = async (params: {
  bot: Bot
  config: Config
  chatId: number
  /** 用户发的那条命令消息，👀 挂在它上面 */
  commandMessageId: number
  action: 'add' | 'remove'
  domain: string
  actor: string
}) => {
  const { bot, config, chatId, commandMessageId, action, domain, actor } = params

  const finish = async (text: string) => {
    await say(bot, chatId, text)
    await setReaction(bot, chatId, commandMessageId, null)
  }

  const { status, body } = await call<MutateBody>(
    config,
    action === 'add' ? 'POST' : 'DELETE',
    '/admin/rule',
    { json: { type: RULE_TYPE, value: domain, actor } }
  )

  if (!body || !body.ok) {
    await finish(describeFailure(status, body))
    return
  }

  const delivered = await waitForServed(config, body.version)
  await finish(delivered ? (action === 'add' ? '添加完成' : '移除完成') : TIMEOUT_TEXT)
}

// ---------- 待确认的移除操作 ----------

type Pending = {
  botName: string
  chatId: number
  commandMessageId: number
  domain: string
  actor: string
  expireAt: number
}

// callback_data 上限 64 字节，塞不下域名，所以用 nonce 索引内存状态。
// 进程重启会丢，届时点确认会得到「已过期」。
const pending = new Map<string, Pending>()

let nonceSeq = 0
const makeNonce = () => `${Date.now().toString(36)}${(nonceSeq++).toString(36)}`

setInterval(() => {
  const now = Date.now()
  for (const [key, value] of pending) {
    if (value.expireAt < now) pending.delete(key)
  }
}, 60 * 1000)

// ---------- 命令 ----------

const handleSearch = async (bot: Bot, config: Config, chatId: number, keyword: string) => {
  if (!keyword) {
    await bot.sendMessage(
      chatId,
      `用法：${code('/search <关键字>')}，或回复一条消息发送 ${code('/search')}`,
      MD
    )
    return
  }

  const { status, body } = await call<SearchBody>(config, 'GET', '/admin/search', {
    searchParams: { q: keyword, limit: SEARCH_LIMIT }
  })
  if (!body || !body.ok) {
    await bot.sendMessage(chatId, describeFailure(status, body), MD)
    return
  }
  if (body.total === 0) {
    await bot.sendMessage(chatId, `没有找到包含 ${code(keyword)} 的规则`, MD)
    return
  }

  const header =
    body.total > body.matches.length
      ? `共 ${body.total} 条，显示前 ${body.matches.length} 条：`
      : `共 ${body.total} 条：`
  const lines = body.matches.map((r) => code(`${r.type},${r.value}`))
  await bot.sendMessage(chatId, `${header}\n${lines.join('\n')}`, MD)
}

const handleAdd = async (
  bot: Bot,
  config: Config,
  chatId: number,
  commandMessageId: number,
  actor: string,
  raw: string
) => {
  const domain = normalizeDomain(raw)
  if (!domain) {
    await bot.sendMessage(
      chatId,
      raw
        ? `域名格式非法：${code(raw)}`
        : `用法：${code('/addDomainSuffix <域名>')}，或回复一条消息发送 ${code(
            '/addDomainSuffix'
          )}`,
      MD
    )
    return
  }

  await setReaction(bot, chatId, commandMessageId, EYES)
  await say(bot, chatId, `正在添加规则 ${ruleText(domain)}`)
  await runMutation({
    bot,
    config,
    chatId,
    commandMessageId,
    action: 'add',
    domain,
    actor
  })
}

const handleRemove = async (
  bot: Bot,
  botName: string,
  config: Config,
  chatId: number,
  commandMessageId: number,
  actor: string,
  raw: string
) => {
  const domain = normalizeDomain(raw)
  if (!domain) {
    await bot.sendMessage(
      chatId,
      raw
        ? `域名格式非法：${code(raw)}`
        : `用法：${code(
            '/removeDomainSuffix <域名>'
          )}，或回复一条消息发送 ${code('/removeDomainSuffix')}`,
      MD
    )
    return
  }

  await setReaction(bot, chatId, commandMessageId, EYES)

  const { status, body } = await call<RuleBody>(config, 'GET', '/admin/rule', {
    searchParams: { type: RULE_TYPE, value: domain }
  })
  if (!body || !body.ok) {
    await bot.sendMessage(chatId, describeFailure(status, body), MD)
    await setReaction(bot, chatId, commandMessageId, null)
    return
  }
  if (!body.rule) {
    await bot.sendMessage(chatId, `未找到该规则：${ruleText(domain)}`, MD)
    await setReaction(bot, chatId, commandMessageId, null)
    return
  }

  const nonce = makeNonce()
  // 先登记再发消息：键盘随消息一起出现，注册晚于发送会留下一个必然「已过期」的窗口
  pending.set(nonce, {
    botName,
    chatId,
    commandMessageId,
    domain,
    actor,
    expireAt: Date.now() + PENDING_TTL
  })

  await bot.sendMessage(chatId, `确认移除 ${ruleText(domain)}？`, {
    ...MD,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '确定', callback_data: `pwm:${nonce}:ok` },
          { text: '取消', callback_data: `pwm:${nonce}:no` }
        ]
      ]
    }
  })
}

/** 移除确认的后台流程。抽出来是为了让 callback_query 的中间件本身保持同步。 */
const handleCallback = async (
  bot: Bot,
  botName: string,
  config: Config,
  ctx: TelegrafContext,
  data: string
) => {
  const [, nonce, action] = data.split(':')
  const entry = pending.get(nonce)
  if (!entry || entry.botName !== botName) {
    await ctx
      .answerCbQuery('该键盘已超时，请重新执行命令')
      .catch(() => undefined)
    return
  }

  pending.delete(nonce)
  await ctx.answerCbQuery().catch(() => undefined)

  await guard(bot, entry.chatId, entry.commandMessageId, async () => {
    if (action !== 'ok') {
      await say(bot, entry.chatId, '已取消')
      await setReaction(bot, entry.chatId, entry.commandMessageId, null)
      return
    }

    await say(bot, entry.chatId, `正在移除规则 ${ruleText(entry.domain)}`)
    await runMutation({
      bot,
      config,
      chatId: entry.chatId,
      commandMessageId: entry.commandMessageId,
      action: 'remove',
      domain: entry.domain,
      actor: entry.actor
    })
  })
}

// ---------- 注册 ----------

for (const [botName, config] of Object.entries(configs ?? {})) {
  if (!config) continue

  if (!config.baseUrl || !config.adminToken || !config.identityTag) {
    void telemetry(
      'modules/proxy-whitelist-manager.ts/config',
      `proxyWhitelistManager.${botName} 缺少 baseUrl / adminToken / identityTag，模块未启用`
    )
    continue
  }

  const bot = getTelegramBotByAnyBotName(botName)

  bot.command.sub(async ({ ctx, commandName, currentChatId, message }) => {
    // 非授权群一律静默，不给任何反馈
    if (!config.superusers?.includes(currentChatId)) return

    // 去掉下划线后统一小写比较，于是 /addDomainSuffix、/adddomainsuffix、
    // /add_domain_suffix 指向同一条命令。BotFather 的 setcommands 只接受
    // 小写与下划线，这样注册成 snake_case 的同时手打驼峰依然有效。
    const cmd = commandName.toLowerCase().replace(/_/g, '')
    if (cmd !== 'search' && cmd !== 'adddomainsuffix' && cmd !== 'removedomainsuffix') {
      return
    }

    await guard(bot, currentChatId, message.message_id, async () => {
      if (!extractArg(message.text ?? '', bot.username)) {
        logReplyArgumentDebug(message, cmd, ctx.update)
      }
      const arg = extractCommandArg(message, bot.username)
      const actor = `tg:${message.from?.id ?? 'unknown'}`

      switch (cmd) {
        case 'search':
          await handleSearch(bot, config, currentChatId, arg)
          break
        case 'adddomainsuffix':
          await handleAdd(bot, config, currentChatId, message.message_id, actor, arg)
          break
        case 'removedomainsuffix':
          await handleRemove(
            bot,
            botName,
            config,
            currentChatId,
            message.message_id,
            actor,
            arg
          )
          break
      }
    })
  })

  // 框架的 eventBus 只转发 message，callback_query 得自己挂。
  // telegraf 允许对同一 updateType 追加多个处理器。
  //
  // 这个 handler 必须是同步的：telegraf 会 await 中间件返回的 Promise，而
  // telegraf-throttler 的入站 maxConcurrent 是 1——一旦让它等 runMutation 的
  // 回执轮询（最长 5 分钟），槽位就被占死，期间该 chat 的所有更新都会溢出丢弃。
  // 所以立刻返回，完整流程扔到后台跑。
  bot.instance.on('callback_query', (ctx) => {
    const data = ctx.callbackQuery?.data
    if (!data || !data.startsWith('pwm:')) return

    void handleCallback(bot, botName, config, ctx, data).catch((error) =>
      telemetry('modules/proxy-whitelist-manager.ts/callback', '', error)
    )
  })
}
