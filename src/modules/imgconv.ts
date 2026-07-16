import sharp from 'sharp'
import { Message } from 'telegram-typings'
import {
  BotType,
  exportBot,
  getTelegramBotByAnyBotName
} from '../interface/telegram'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'
import { downloadStream } from '../utils/file'

const SHORT_COOLDOWN_MS = 30 * 1000
const MAX_QUOTA = 5
const MAX_FILE_SIZE = 30 * 1024 * 1024
const MAX_FORMAT_NAME_LENGTH = 10
const QUARTER_HOUR_MS = 15 * 60 * 1000
const TIMESTAMP_HISTORY_KEEP = 10
const USER_STATE_STALE_MS = 6 * 60 * 60 * 1000
const USER_STATE_PRUNE_THRESHOLD = 1000

const OUTPUT_FORMAT_MAP: Record<string, keyof sharp.FormatEnum> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
  tiff: 'tiff',
  heif: 'heif'
}

const SUPPORTED_FORMATS = Object.keys(OUTPUT_FORMAT_MAP)

const paramDefinition: ParamsDefinition = {
  argumentList: [
    {
      name: 'format',
      acceptable: `目标格式。支持：${SUPPORTED_FORMATS.join(', ')}。`
    }
  ],
  replyMessageType: '待转换的图片（作为文件或普通图片发送）。'
}

type UserState = {
  requestTimestamps: number[]
  quota: number
  lastRefillCheckpoint: number
  lastSeen: number
}

const userState = new Map<number, UserState>()

const pruneStaleUserState = (now: number) => {
  if (userState.size <= USER_STATE_PRUNE_THRESHOLD) return
  const cutoff = now - USER_STATE_STALE_MS
  for (const [id, s] of userState) {
    if (s.lastSeen < cutoff) userState.delete(id)
  }
}

const getPrevQuarterHourBoundary = (t: number) => {
  const d = new Date(t)
  d.setSeconds(0, 0)
  d.setMinutes(Math.floor(d.getMinutes() / 15) * 15)
  return d.getTime()
}

const formatHHMM = (t: number) => {
  const d = new Date(t)
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

const ensureState = (userId: number): UserState => {
  const now = Date.now()
  pruneStaleUserState(now)
  let s = userState.get(userId)
  if (!s) {
    s = {
      requestTimestamps: [],
      quota: MAX_QUOTA,
      lastRefillCheckpoint: getPrevQuarterHourBoundary(now),
      lastSeen: now
    }
    userState.set(userId, s)
    return s
  }
  s.lastSeen = now
  const currentBoundary = getPrevQuarterHourBoundary(now)
  if (currentBoundary > s.lastRefillCheckpoint) {
    const boundariesPassed = Math.floor(
      (currentBoundary - s.lastRefillCheckpoint) / QUARTER_HOUR_MS
    )
    s.quota = Math.min(MAX_QUOTA, s.quota + boundariesPassed)
    s.lastRefillCheckpoint = currentBoundary
  }
  return s
}

type SourceFile = {
  fileId: string
  fileSize?: number
}

const detectSourceFile = (msg: Message | undefined): SourceFile | null => {
  if (!msg) return null
  if (msg.document) {
    const mime = msg.document.mime_type || ''
    if (mime && !mime.startsWith('image/')) return null
    return { fileId: msg.document.file_id, fileSize: msg.document.file_size }
  }
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo.reduce((max, p) =>
      (p.file_size || 0) > (max.file_size || 0) ? p : max
    )
    return { fileId: largest.file_id, fileSize: largest.file_size }
  }
  return null
}

const collectStreamToBuffer = (
  stream: NodeJS.ReadableStream,
  sizeLimit: number
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > sizeLimit) {
        ;(stream as { destroy?: () => void }).destroy?.()
        reject(new Error('文件下载超过 30M 上限。'))
        return
      }
      chunks.push(chunk)
    })
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })

const createWorker = (worker: BotType) => {
  worker.command.sub(async (p) => {
    const {
      ctx,
      args,
      commandName,
      currentChatId,
      message,
      sendMessageToCurrentChat
    } = p
    if (commandName !== 'imgconv') return

    const userId = message.from?.id
    if (!userId) return

    const rawArg = (args[0] || '').trim()
    if (!rawArg) {
      await sendMessageToCurrentChat(
        errorMessages.illegalArguments(paramDefinition)
      )
      return
    }
    if (rawArg.length > MAX_FORMAT_NAME_LENGTH) {
      await sendMessageToCurrentChat(
        `格式名长度不合法（最多 ${MAX_FORMAT_NAME_LENGTH} 字符）。`
      )
      return
    }
    const targetFormat = rawArg.toLowerCase()
    const sharpFormat = OUTPUT_FORMAT_MAP[targetFormat]
    if (!sharpFormat) {
      await sendMessageToCurrentChat(
        `不支持的目标格式：${targetFormat}。\n${errorMessages.illegalArguments(
          paramDefinition
        )}`
      )
      return
    }

    const reply = message.reply_to_message
    if (!reply) {
      await sendMessageToCurrentChat(
        errorMessages.illegalReplyMessageCount(paramDefinition)
      )
      return
    }
    const source = detectSourceFile(reply)
    if (!source) {
      await sendMessageToCurrentChat(
        errorMessages.illegalReplyMessage(paramDefinition)
      )
      return
    }
    if (source.fileSize && source.fileSize > MAX_FILE_SIZE) {
      await sendMessageToCurrentChat(
        `文件过大：${(source.fileSize / 1024 / 1024).toFixed(1)}M，超过上限 30M。`
      )
      return
    }

    const state = ensureState(userId)
    const now = Date.now()
    const lastRequest =
      state.requestTimestamps[state.requestTimestamps.length - 1]
    if (lastRequest && now - lastRequest < SHORT_COOLDOWN_MS) {
      const waitSeconds = Math.ceil(
        (SHORT_COOLDOWN_MS - (now - lastRequest)) / 1000
      )
      await sendMessageToCurrentChat(
        `短冷却：每 30 秒最多请求一次，下次可于 ${waitSeconds} 秒后请求。`
      )
      return
    }

    if (state.quota <= 0) {
      const nextBoundary =
        getPrevQuarterHourBoundary(now) + QUARTER_HOUR_MS
      await sendMessageToCurrentChat(
        `长冷却：转换额度已用尽，下次恢复于 ${formatHHMM(nextBoundary)}。`
      )
      return
    }

    state.requestTimestamps.push(now)
    if (state.requestTimestamps.length > TIMESTAMP_HISTORY_KEEP) {
      state.requestTimestamps.splice(
        0,
        state.requestTimestamps.length - TIMESTAMP_HISTORY_KEEP
      )
    }

    state.quota -= 1

    let conversionSucceeded = false
    try {
      const fileLink = await worker.instance.telegram.getFileLink(
        source.fileId
      )
      const stream = downloadStream(fileLink)
      const inputBuffer = await collectStreamToBuffer(stream, MAX_FILE_SIZE)

      worker.instance.telegram
        .sendChatAction(currentChatId, 'upload_document')
        .catch(() => {})

      const outputBuffer = await sharp(inputBuffer, { animated: true })
        .toFormat(sharpFormat)
        .toBuffer()

      await worker.instance.telegram.sendDocument(
        currentChatId,
        {
          source: outputBuffer,
          filename: `converted.${targetFormat}`
        } as unknown as Parameters<
          typeof worker.instance.telegram.sendDocument
        >[1],
        {
          reply_to_message_id: ctx.message?.message_id
        }
      )
      conversionSucceeded = true
    } catch (e) {
      state.quota = Math.min(MAX_QUOTA, state.quota + 1)
      const msg = e instanceof Error ? e.message : String(e)
      await sendMessageToCurrentChat(`转换失败：${msg}`)
    }

    if (conversionSucceeded) {
      const nextBoundary =
        getPrevQuarterHourBoundary(Date.now()) + QUARTER_HOUR_MS
      try {
        await sendMessageToCurrentChat(
          `当前转换额度 ${state.quota}/${MAX_QUOTA}，下次恢复于 ${formatHHMM(
            nextBoundary
          )}。`
        )
      } catch (e) {
        console.warn('imgconv: failed to send quota status message', e)
      }
    }
  })
}

Object.keys(exportBot).forEach((botName) =>
  createWorker(getTelegramBotByAnyBotName(botName))
)
