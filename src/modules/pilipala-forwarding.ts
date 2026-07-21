/* eslint-disable @typescript-eslint/no-explicit-any */
// B 站动态响应结构庞大且字段可能缺失，用 any 便于访问。
import got from 'got'
import { isNull } from 'lodash-es'
import telemetry from '../utils/telemetry'
import persistConfig from '../utils/persistConfig'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { TelegramBotName } from '../utils/type'
import { argsTypeValidation, isNumeric, sleep } from '../utils/lang'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'

// desktop 变体：不需要 wbi 签名 / bili_ticket / buvid cookie，只要 UA。
// 但 B 站会随机返 200 + items=[]（软风控），命中率约 50%，靠重试兜住。
const BILI_ENDPOINT =
  'https://api.bilibili.com/x/polymer/web-dynamic/desktop/v1/feed/space'
const BILI_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'
const MAX_EMPTY_RETRIES = 10
const RETRY_INTERVAL_MS = 2000

const HISTORY_BUFFER_SIZE = 20
const HISTORY_COMMAND = 'configure_history_pilipala_post_count'

// ---------- 类型 ----------

type Item = any // B 站原始返回结构复杂，用 any 便于访问

type NormalizedBase = {
  id: string
  pubTs: number
  author: { name: string; mid: number }
  text: string
  url: string
}
type NormalizedWord = NormalizedBase & { kind: 'WORD' }
type NormalizedDraw = NormalizedBase & { kind: 'DRAW'; pics: string[] }
type NormalizedAv = NormalizedBase & {
  kind: 'AV'
  video: { title: string; cover: string; bvid: string; url: string }
}
type NormalizedForward = NormalizedBase & {
  kind: 'FORWARD'
  forward: {
    author: string
    text: string
    pics: string[]
    url: string
    videoTitle?: string
  }
}
type Normalized = NormalizedWord | NormalizedDraw | NormalizedAv | NormalizedForward

const configs = persistConfig.entries.pilipala

const store: Partial<
  Record<
    TelegramBotName,
    {
      startFrom: null | bigint
      recentItems: Normalized[]
    }
  >
> = {}

// ---------- 命令 ----------

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, commandName, args }) => {
    if (commandName !== HISTORY_COMMAND) return
    const paramsDefinition: ParamsDefinition = {
      argumentList: [
        {
          name: 'historyCount',
          acceptable: '下次推送从前几条开始推送。0 表示不使用历史动态。'
        }
      ]
    }
    const chatId = ctx.chat?.id
    if (!chatId) return
    if (!config.superusers?.length) {
      void bot.sendMessage(chatId, 'No superuser configured.')
      return
    }
    if (!config.superusers.includes(chatId)) {
      void bot.sendMessage(
        chatId,
        'You are not in the sudoers file. This incident will be reported.'
      )
      return
    }
    if (args.length !== 1) {
      void bot.sendMessage(
        chatId,
        errorMessages.illegalArgumentCount(1, args.length, paramsDefinition)
      )
      return
    }
    if (!argsTypeValidation(args, [isNumeric])) {
      void bot.sendMessage(
        chatId,
        errorMessages.illegalArguments(paramsDefinition)
      )
      return
    }
    const currentStore = store[botName as TelegramBotName]
    if (!currentStore) {
      void bot.sendMessage(chatId, '你来的真早！store 尚未被初始化。')
      return
    }
    if (currentStore.recentItems.length === 0) {
      void bot.sendMessage(chatId, 'History not available at this time.')
      return
    }
    const historyCount = parseInt(args[0])
    if (historyCount > currentStore.recentItems.length) {
      void bot.sendMessage(
        chatId,
        `History count cannot greater than history record length which is ${currentStore.recentItems.length}.`
      )
      return
    }
    const items = currentStore.recentItems.concat()
    if (historyCount === 0) {
      currentStore.startFrom = BigInt(items[0].id)
    } else {
      currentStore.startFrom = BigInt(items[historyCount - 1].id) - BigInt(1)
    }
    await bot.sendMessage(
      chatId,
      historyCount === 0
        ? 'Success.'
        : `Success. Next time we will start from: ${items[historyCount - 1].url}`
    )
  })
}

// ---------- 抓取 + 裁剪 ----------

const opusUrl = (id: string) => `https://www.bilibili.com/opus/${id}`
const videoUrl = (bvid: string) => `https://www.bilibili.com/video/${bvid}`
const stripProto = (u: string) => u.replace(/^http:\/\//, 'https://')

// desktop 端点的 modules 是 array，每个元素带 module_type 标签
const findModule = (item: Item, type: string): any =>
  (item.modules ?? []).find((m: any) => m.module_type === type) ?? {}

// 剥掉 bili 表情包（[xxx_yyy] 形式，从 rich_text_nodes 里精确剔除，
// 避免误伤正文里合法的方括号）；若剥完是空的，就保留原文本
const extractText = (desc: any): string => {
  if (!desc) return ''
  const nodes = desc.rich_text_nodes
  if (!Array.isArray(nodes) || nodes.length === 0) return desc.text ?? ''
  const nonEmoji = nodes.filter(
    (n: any) => n.type !== 'RICH_TEXT_NODE_TYPE_EMOJI'
  )
  const joined = nonEmoji.map((n: any) => n.text ?? '').join('').trim()
  return joined || (desc.text ?? '')
}

const shouldDrop = (item: Item): boolean => {
  // LIVE_RCMD 由 bili-live 模块负责，避免重复
  if (item.type === 'DYNAMIC_TYPE_LIVE_RCMD') return true
  // 置顶：desktop 端点用 module_author.is_top 标记
  if (findModule(item, 'MODULE_TYPE_AUTHOR').module_author?.is_top) return true
  return false
}

const normalize = (item: Item): Normalized | null => {
  const type: string = item.type
  const author = findModule(item, 'MODULE_TYPE_AUTHOR').module_author
  const desc = findModule(item, 'MODULE_TYPE_DESC').module_desc
  const dynMod = findModule(item, 'MODULE_TYPE_DYNAMIC').module_dynamic

  const base: NormalizedBase = {
    id: item.id_str,
    pubTs: Number(author?.pub_ts ?? 0),
    author: {
      name: author?.user?.name ?? '',
      mid: Number(author?.user?.mid ?? 0)
    },
    text: extractText(desc),
    url: opusUrl(item.id_str)
  }

  if (type === 'DYNAMIC_TYPE_WORD') {
    return { ...base, kind: 'WORD' }
  }

  if (type === 'DYNAMIC_TYPE_DRAW') {
    const rawPics = dynMod?.dyn_draw?.items ?? []
    const pics: string[] = rawPics
      .map((p: any) => stripProto(p.src))
      .filter(Boolean)
    return { ...base, kind: 'DRAW', pics }
  }

  if (type === 'DYNAMIC_TYPE_AV') {
    const archive = dynMod?.dyn_archive
    if (!archive) return null
    return {
      ...base,
      kind: 'AV',
      video: {
        title: archive.title ?? '',
        cover: stripProto(archive.cover ?? ''),
        bvid: archive.bvid ?? '',
        url: videoUrl(archive.bvid ?? '')
      }
    }
  }

  if (type === 'DYNAMIC_TYPE_FORWARD') {
    const origItem = dynMod?.dyn_forward?.item
    if (!origItem) {
      return {
        ...base,
        kind: 'FORWARD',
        forward: { author: '', text: '', pics: [], url: '' }
      }
    }
    const origAuthor = findModule(origItem, 'MODULE_TYPE_AUTHOR').module_author
    const origDesc = findModule(origItem, 'MODULE_TYPE_DESC').module_desc
    const origDynMod = findModule(origItem, 'MODULE_TYPE_DYNAMIC').module_dynamic
    const origDrawItems = origDynMod?.dyn_draw?.items ?? []
    const origPics: string[] = origDrawItems
      .map((p: any) => stripProto(p.src))
      .filter(Boolean)
    const origArchive = origDynMod?.dyn_archive
    const forwardObj: NormalizedForward['forward'] = {
      author: origAuthor?.user?.name ?? '',
      text: extractText(origDesc),
      pics: origPics,
      url: opusUrl(origItem.id_str)
    }
    if (origArchive) {
      forwardObj.videoTitle = origArchive.title ?? ''
      forwardObj.url = videoUrl(origArchive.bvid ?? '')
    }
    return { ...base, kind: 'FORWARD', forward: forwardObj }
  }

  return null
}

/**
 * 从 B 站抓一页动态并裁剪。命中软风控（items=[]）就重试。
 * 返回 null 表示彻底失败（10 次都空 / HTTP 出错）。
 */
const fetchNormalized = async (
  hostMid: string
): Promise<Normalized[] | null> => {
  for (let attempt = 1; attempt <= MAX_EMPTY_RETRIES; attempt++) {
    let resp: any
    try {
      resp = await got(BILI_ENDPOINT, {
        searchParams: { host_mid: hostMid },
        headers: {
          'User-Agent': BILI_UA,
          Referer: `https://space.bilibili.com/${hostMid}/dynamic`
        },
        timeout: 30000,
        retry: { limit: 0 }
      }).json<any>()
    } catch (err) {
      if (attempt < MAX_EMPTY_RETRIES) {
        await sleep(RETRY_INTERVAL_MS)
        continue
      }
      void telemetry(
        `pilipala-forwarding.ts/fetchNormalized`,
        `连续 ${MAX_EMPTY_RETRIES} 次 HTTP 失败，本轮放弃 host_mid=${hostMid}`,
        err
      )
      return null
    }
    const items: Item[] = resp?.data?.items ?? []
    if (items.length === 0) {
      if (attempt < MAX_EMPTY_RETRIES) {
        await sleep(RETRY_INTERVAL_MS)
        continue
      }
      void telemetry(
        `pilipala-forwarding.ts/fetchNormalized`,
        `连续 ${MAX_EMPTY_RETRIES} 次拿到空 items（被 B 站软风控），本轮放弃 host_mid=${hostMid}`
      )
      return null
    }
    const normalized: Normalized[] = []
    for (const it of items) {
      if (shouldDrop(it)) continue
      const n = normalize(it)
      if (n) normalized.push(n)
    }
    // 按 id 从新到旧排序
    normalized.sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? -1 : 1))
    return normalized
  }
  return null
}

// ---------- 发送 ----------

const fetchImageAsBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    return await got(url.replace(/^http:\/\//, 'https://'), {
      responseType: 'buffer',
      timeout: 30000,
      retry: { limit: 2 },
      headers: {
        'User-Agent': BILI_UA,
        Referer: 'https://www.bilibili.com/'
      }
    }).buffer()
  } catch (err) {
    void telemetry(
      `pilipala-forwarding.ts/fetchImageAsBuffer`,
      `download failed: ${url}`,
      err
    )
    return null
  }
}

const sendItem = async (
  bot: ReturnType<typeof getTelegramBotByAnyBotName>,
  dest: number,
  item: Normalized
) => {
  const telegram = bot.instance.telegram

  if (item.kind === 'WORD') {
    const text = item.text ? `${item.text}\n\n${item.url}` : item.url
    await bot.sendMessage(dest, text)
    return
  }

  if (item.kind === 'DRAW') {
    const caption = item.text ? `${item.text}\n\n${item.url}` : item.url
    const buffers = await Promise.all(item.pics.map(fetchImageAsBuffer))
    const validBuffers = buffers.filter((b): b is Buffer => !!b)
    if (validBuffers.length === 0) {
      await bot.sendMessage(dest, caption)
      return
    }
    if (validBuffers.length === 1) {
      await telegram.sendPhoto(dest, { source: validBuffers[0] }, { caption })
      return
    }
    const media = validBuffers.map((buf, idx) => ({
      type: 'photo' as const,
      media: { source: buf },
      ...(idx === 0 ? { caption } : {})
    }))
    await telegram.sendMediaGroup(dest, media)
    return
  }

  if (item.kind === 'AV') {
    const caption =
      `${item.author.name} 投稿了视频\n\n${item.video.title}` +
      (item.text ? `\n\n${item.text}` : '') +
      `\n\n${item.video.url}`
    const cover = await fetchImageAsBuffer(item.video.cover)
    if (!cover) {
      await bot.sendMessage(dest, caption)
      return
    }
    await telegram.sendPhoto(dest, { source: cover }, { caption })
    return
  }

  if (item.kind === 'FORWARD') {
    const origPicsLine = item.forward.pics.length
      ? '\n' + item.forward.pics.join('\n')
      : ''
    const origVideoLine = item.forward.videoTitle
      ? `\n视频：${item.forward.videoTitle}`
      : ''
    const commentLine = item.text ? `\n${item.text}\n` : '\n'
    const text =
      `${item.author.name} 转发了 ${item.forward.author} 的动态：` +
      `${commentLine}` +
      `\n---原文---\n${item.forward.text}${origVideoLine}${origPicsLine}\n\n${item.url}`
    await bot.sendMessage(dest, text)
    return
  }
}

// ---------- 主循环 ----------

const worker = async (botName: string) => {
  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]

  if (!store[botName as TelegramBotName]) {
    store[botName as TelegramBotName] = {
      startFrom: null,
      recentItems: []
    }
  }
  const currentStore = store[botName as TelegramBotName]!

  const normalized = await fetchNormalized(config.hostMid)
  if (!normalized) return

  // 更新滚动缓冲区
  const merged = normalized.concat(currentStore.recentItems)
  const seen = new Set<string>()
  currentStore.recentItems = merged
    .filter((it) => {
      if (seen.has(it.id)) return false
      seen.add(it.id)
      return true
    })
    .slice(0, HISTORY_BUFFER_SIZE)

  // 首次运行：跳过推送，仅记录基线
  if (isNull(currentStore.startFrom)) {
    currentStore.startFrom = BigInt(normalized[0].id)
    return
  }

  // 过滤：只推送比 startFrom 更新的
  const toSend = normalized
    .filter((it) => BigInt(it.id) > currentStore.startFrom!)
    .reverse() // 从旧到新推送
  if (toSend.length === 0) return

  for (const item of toSend) {
    try {
      await sendItem(bot, config.dest, item)
      const delaySec = Math.floor(Date.now() / 1000) - item.pubTs
      if (delaySec > 15 * 60) {
        const delayMin = Math.floor(delaySec / 60)
        void telemetry(
          `pilipala-forwarding.ts/pushDelay`,
          `动态推送延迟：${item.author.name} 的动态 ${item.id} 发布于 ${new Date(item.pubTs * 1000).toISOString()}，实际推送延迟 ${delayMin} 分钟（${item.url}）`
        )
      }
    } catch (err) {
      void telemetry(
        `pilipala-forwarding.ts/sendItem`,
        `发送失败：${item.id}`,
        err
      )
    }
  }
  currentStore.startFrom = BigInt(normalized[0].id)
}

const main = async (botName: string) => {
  await worker(botName).catch((...args) =>
    telemetry(`pilipala-forwarding.ts/worker`, ...args)
  )
  setTimeout(
    () => main(botName),
    configs[botName as TelegramBotName].updateInterval
  )
}

Object.keys(configs).forEach((el) => main(el))
