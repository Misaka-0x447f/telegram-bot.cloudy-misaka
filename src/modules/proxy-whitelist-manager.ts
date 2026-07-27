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
 */

import got from 'got'
import * as tt from 'telegraf/typings/telegram-types'
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
  if (reason) return REASON_TEXT[reason] ?? `失败：${reason}`
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

/** 编辑时不带 reply_markup，Telegram 会一并移除原有键盘 */
const editText = async (
  bot: Bot,
  chatId: number,
  messageId: number,
  text: string,
  extra?: tt.ExtraEditMessage
) => {
  await bot.instance.telegram
    .editMessageText(chatId, messageId, undefined, text, extra)
    .catch((error) =>
      telemetry('modules/proxy-whitelist-manager.ts/editText', '', error)
    )
}

/** 去掉命令本身与可能的尾部 @botname，剩下的就是参数 */
const extractArg = (text: string, username?: string): string => {
  let rest = text.replace(/^\/[A-Za-z0-9_]+(?:@[A-Za-z0-9_]+)?\s*/, '')
  if (username) rest = rest.replace(new RegExp(`@${username}$`), '')
  return rest.trim()
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
  /** 进度消息，最终被编辑成结果 */
  progressMessageId: number
  action: 'add' | 'remove'
  domain: string
  actor: string
}) => {
  const { bot, config, chatId, commandMessageId, progressMessageId, action, domain, actor } =
    params

  const finish = async (text: string) => {
    await editText(bot, chatId, progressMessageId, text)
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
  promptMessageId: number
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
    await bot.sendMessage(chatId, '用法：/search <关键字>')
    return
  }

  const { status, body } = await call<SearchBody>(config, 'GET', '/admin/search', {
    searchParams: { q: keyword, limit: SEARCH_LIMIT }
  })
  if (!body || !body.ok) {
    await bot.sendMessage(chatId, describeFailure(status, body))
    return
  }
  if (body.total === 0) {
    await bot.sendMessage(chatId, `没有找到包含「${keyword}」的规则`)
    return
  }

  const header =
    body.total > body.matches.length
      ? `共 ${body.total} 条，显示前 ${body.matches.length} 条：`
      : `共 ${body.total} 条：`
  const lines = body.matches.map((r) => `${r.type},${r.value}`)
  await bot.sendMessage(chatId, `${header}\n${lines.join('\n')}`)
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
      raw ? `域名格式非法：${raw}` : '用法：/addDomainSuffix <域名>'
    )
    return
  }

  await setReaction(bot, chatId, commandMessageId, EYES)
  const progress = await bot.sendMessage(
    chatId,
    `正在添加规则 ${RULE_TYPE}, ${domain}`
  )
  await runMutation({
    bot,
    config,
    chatId,
    commandMessageId,
    progressMessageId: progress.message_id,
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
      raw ? `域名格式非法：${raw}` : '用法：/removeDomainSuffix <域名>'
    )
    return
  }

  await setReaction(bot, chatId, commandMessageId, EYES)

  const { status, body } = await call<RuleBody>(config, 'GET', '/admin/rule', {
    searchParams: { type: RULE_TYPE, value: domain }
  })
  if (!body || !body.ok) {
    await bot.sendMessage(chatId, describeFailure(status, body))
    await setReaction(bot, chatId, commandMessageId, null)
    return
  }
  if (!body.rule) {
    await bot.sendMessage(chatId, `未找到该规则：${RULE_TYPE}, ${domain}`)
    await setReaction(bot, chatId, commandMessageId, null)
    return
  }

  const nonce = makeNonce()
  const prompt = await bot.sendMessage(
    chatId,
    `确认移除 ${RULE_TYPE}, ${domain}？`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '确定', callback_data: `pwm:${nonce}:ok` },
            { text: '取消', callback_data: `pwm:${nonce}:no` }
          ]
        ]
      }
    }
  )

  pending.set(nonce, {
    botName,
    chatId,
    commandMessageId,
    promptMessageId: prompt.message_id,
    domain,
    actor,
    expireAt: Date.now() + PENDING_TTL
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

  bot.command.sub(async ({ commandName, currentChatId, message }) => {
    // 非授权群一律静默，不给任何反馈
    if (!config.superusers?.includes(currentChatId)) return

    const arg = extractArg(message.text ?? '', bot.username)
    const actor = `tg:${message.from?.id ?? 'unknown'}`

    switch (commandName.toLowerCase()) {
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

  // 框架的 eventBus 只转发 message，callback_query 得自己挂。
  // telegraf 允许对同一 updateType 追加多个处理器。
  bot.instance.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery?.data
    if (!data || !data.startsWith('pwm:')) return

    const [, nonce, action] = data.split(':')
    const entry = pending.get(nonce)
    if (!entry || entry.botName !== botName) {
      await ctx.answerCbQuery('这个确认已过期').catch(() => undefined)
      return
    }

    pending.delete(nonce)
    await ctx.answerCbQuery().catch(() => undefined)

    if (action !== 'ok') {
      await editText(bot, entry.chatId, entry.promptMessageId, '已取消')
      await setReaction(bot, entry.chatId, entry.commandMessageId, null)
      return
    }

    await editText(
      bot,
      entry.chatId,
      entry.promptMessageId,
      `正在移除规则 ${RULE_TYPE}, ${entry.domain}`
    )
    await runMutation({
      bot,
      config,
      chatId: entry.chatId,
      commandMessageId: entry.commandMessageId,
      progressMessageId: entry.promptMessageId,
      action: 'remove',
      domain: entry.domain,
      actor: entry.actor
    })
  })
}
