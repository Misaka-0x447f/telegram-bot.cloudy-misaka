import crypto from 'crypto'
import execa from 'execa'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { Message } from 'telegram-typings'
import {
  BotType,
  exportBot,
  getTelegramBotByAnyBotName
} from '../interface/telegram'
import errorMessages, {
  getHelpMessage,
  ParamsDefinition
} from '../utils/errorMessages'
import { downloadStream } from '../utils/file'

const SHORT_COOLDOWN_MS = 30 * 1000
const MAX_QUOTA = 5
const MAX_IMAGE_INPUT_SIZE = 30 * 1024 * 1024
const MAX_VIDEO_INPUT_SIZE = 1 * 1024 * 1024
const MAX_FORMAT_NAME_LENGTH = 10
const QUARTER_HOUR_MS = 15 * 60 * 1000
const TIMESTAMP_HISTORY_KEEP = 10
const USER_STATE_STALE_MS = 6 * 60 * 60 * 1000
const USER_STATE_PRUNE_THRESHOLD = 1000
// Cap decoded pixel count to bound sharp's memory. 100M pixels covers up to
// roughly 10000x10000 images, above what any legitimate reply would need,
// while stopping decompression-bomb payloads whose compressed size is small
// but whose decoded dimensions are huge.
const SHARP_INPUT_PIXEL_LIMIT = 100_000_000
const TASK_TIMEOUT_MS = 60 * 1000

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
      acceptable:
        `目标格式。图片输入支持：${SUPPORTED_FORMATS.join(', ')}；` +
        '视频/动图/视频贴纸输入仅支持 gif。'
    }
  ],
  replyMessageType:
    '待转换的图片或视频（图片作为文件/普通图片，视频作为视频/动图/视频贴纸/document）。'
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

type SourceKind = 'image' | 'video'
type SourceFile = {
  fileId: string
  fileSize?: number
  kind: SourceKind
  mimeType?: string
}

type DetectResult =
  | { ok: true; file: SourceFile }
  | { ok: false; reason: string }

const detectSourceFile = (msg: Message | undefined): DetectResult => {
  if (!msg) return { ok: false, reason: '未回复任何消息' }
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo.reduce((max, p) =>
      (p.file_size || 0) > (max.file_size || 0) ? p : max
    )
    return {
      ok: true,
      file: {
        fileId: largest.file_id,
        fileSize: largest.file_size,
        kind: 'image'
      }
    }
  }
  if (msg.sticker) {
    // is_video is on the Bot API but missing from telegram-typings@5's Sticker.
    const isVideo = (msg.sticker as { is_video?: boolean }).is_video === true
    if (msg.sticker.is_animated) {
      return {
        ok: false,
        reason: '被回复的是 tgs 动画贴纸，当前不支持'
      }
    }
    if (isVideo) {
      return {
        ok: true,
        file: {
          fileId: msg.sticker.file_id,
          fileSize: msg.sticker.file_size,
          kind: 'video',
          mimeType: 'video/webm'
        }
      }
    }
    return {
      ok: true,
      file: {
        fileId: msg.sticker.file_id,
        fileSize: msg.sticker.file_size,
        kind: 'image',
        mimeType: 'image/webp'
      }
    }
  }
  if (msg.animation) {
    return {
      ok: true,
      file: {
        fileId: msg.animation.file_id,
        fileSize: msg.animation.file_size,
        kind: 'video',
        mimeType: msg.animation.mime_type || 'video/mp4'
      }
    }
  }
  if (msg.video) {
    return {
      ok: true,
      file: {
        fileId: msg.video.file_id,
        fileSize: msg.video.file_size,
        kind: 'video',
        mimeType: msg.video.mime_type || 'video/mp4'
      }
    }
  }
  if (msg.video_note) {
    return {
      ok: true,
      file: {
        fileId: msg.video_note.file_id,
        fileSize: msg.video_note.file_size,
        kind: 'video',
        mimeType: 'video/mp4'
      }
    }
  }
  if (msg.document) {
    const mime = msg.document.mime_type || ''
    if (mime.startsWith('image/')) {
      return {
        ok: true,
        file: {
          fileId: msg.document.file_id,
          fileSize: msg.document.file_size,
          kind: 'image',
          mimeType: mime
        }
      }
    }
    if (mime.startsWith('video/')) {
      return {
        ok: true,
        file: {
          fileId: msg.document.file_id,
          fileSize: msg.document.file_size,
          kind: 'video',
          mimeType: mime
        }
      }
    }
    if (!mime) {
      return {
        ok: false,
        reason: '被回复的文件没有 mime_type，无法确认是否是图片或视频'
      }
    }
    return {
      ok: false,
      reason: `被回复的文件是 ${mime} 类型，需要 image/* 或 video/* 类型`
    }
  }
  if (msg.voice) return { ok: false, reason: '被回复的是语音消息' }
  if (msg.audio) return { ok: false, reason: '被回复的是音频文件' }
  if (msg.text) {
    return { ok: false, reason: '被回复的是纯文本消息，没有图片或视频' }
  }
  return { ok: false, reason: '被回复的消息里没有找到可转换的图片或视频' }
}

const FFMPEG_VIDEO_TO_GIF_FILTER =
  'fps=15,split[s0][s1];[s0]palettegen=stats_mode=diff[p];' +
  '[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'

const mimeToExt = (mime: string | undefined) => {
  if (!mime) return 'dat'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('quicktime')) return 'mov'
  return 'dat'
}

const runFfmpegVideoToGif = async (
  inputBuffer: Buffer,
  inputMime: string | undefined,
  timeoutMs: number
): Promise<Buffer> => {
  const rand = crypto.randomBytes(8).toString('hex')
  const inputPath = path.join(
    os.tmpdir(),
    `imgconv-${rand}-in.${mimeToExt(inputMime)}`
  )
  const outputPath = path.join(os.tmpdir(), `imgconv-${rand}-out.gif`)
  try {
    await fs.writeFile(inputPath, inputBuffer)
    await execa('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-vf',
      FFMPEG_VIDEO_TO_GIF_FILTER,
      outputPath
    ], { timeout: timeoutMs, killSignal: 'SIGKILL' })
    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(inputPath, { force: true }).catch(() => {})
    await fs.rm(outputPath, { force: true }).catch(() => {})
  }
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
        reject(
          new Error(
            `文件下载超过 ${(sizeLimit / 1024 / 1024).toFixed(0)}M 上限。`
          )
        )
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
      args,
      commandName,
      currentChatId,
      message,
      sendMessageToCurrentChat
    } = p
    if (commandName !== 'imgconv') return

    const userId = message.from?.id
    if (!userId) {
      await sendMessageToCurrentChat(
        '无法识别发送者身份，该命令在频道消息或匿名管理员场景下不可用。'
      )
      return
    }

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
    const detection = detectSourceFile(reply)
    if (!detection.ok) {
      await sendMessageToCurrentChat(
        `不合法的回复消息：${detection.reason}。\n${getHelpMessage(
          paramDefinition
        )}`
      )
      return
    }
    const source = detection.file
    if (source.kind === 'video' && targetFormat !== 'gif') {
      await sendMessageToCurrentChat(
        `视频输入只支持转换为 gif，当前目标格式是 ${targetFormat}。`
      )
      return
    }
    const inputSizeLimit =
      source.kind === 'video' ? MAX_VIDEO_INPUT_SIZE : MAX_IMAGE_INPUT_SIZE
    if (source.fileSize && source.fileSize > inputSizeLimit) {
      const limitMB = (inputSizeLimit / 1024 / 1024).toFixed(0)
      const sizeMB = (source.fileSize / 1024 / 1024).toFixed(1)
      await sendMessageToCurrentChat(
        `文件过大：${sizeMB}M，${source.kind === 'video' ? '视频' : '图片'}输入上限 ${limitMB}M。`
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
    let timedOut = false
    let timeoutHandle: NodeJS.Timeout | undefined
    const taskDeadline = Date.now() + TASK_TIMEOUT_MS
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true
          reject(
            new Error(
              `任务超时（${TASK_TIMEOUT_MS / 1000} 秒内未完成），本次仍会消耗额度。`
            )
          )
        }, TASK_TIMEOUT_MS)
      })
      await Promise.race([
        (async () => {
          const fileLink = await worker.instance.telegram.getFileLink(
            source.fileId
          )
          const stream = downloadStream(fileLink)
          const inputBuffer = await collectStreamToBuffer(
            stream,
            inputSizeLimit
          )

          worker.instance.telegram
            .sendChatAction(currentChatId, 'upload_document')
            .catch(() => {})

          const outputBuffer =
            source.kind === 'video'
              ? await runFfmpegVideoToGif(
                  inputBuffer,
                  source.mimeType,
                  Math.max(1, taskDeadline - Date.now())
                )
              : await sharp(inputBuffer, {
                  animated: true,
                  limitInputPixels: SHARP_INPUT_PIXEL_LIMIT
                })
                  .toFormat(sharpFormat)
                  .toBuffer()

          // If the race already resolved as a timeout, don't dispatch the
          // completed file — the user has already been told this attempt
          // failed, and sending it now would contradict that message.
          if (timedOut) return

          await worker.instance.telegram.sendDocument(
            currentChatId,
            {
              source: outputBuffer,
              filename: `converted.${targetFormat}`
            } as unknown as Parameters<
              typeof worker.instance.telegram.sendDocument
            >[1],
            {
              reply_to_message_id: message.message_id
            }
          )
        })(),
        timeoutPromise
      ])
      conversionSucceeded = true
    } catch (e) {
      // execa sets `timedOut` on its error when the child hits its own
      // timeout; treat that the same as the outer race so both deadlines
      // converge on one "task timeout" behavior (no refund, unified msg).
      const isExecaTimeout =
        typeof e === 'object' &&
        e !== null &&
        (e as { timedOut?: boolean }).timedOut === true
      if (isExecaTimeout) timedOut = true
      if (!timedOut) {
        state.quota = Math.min(MAX_QUOTA, state.quota + 1)
      }
      const msg = timedOut
        ? `任务超时（${TASK_TIMEOUT_MS / 1000} 秒内未完成），本次仍会消耗额度。`
        : e instanceof Error
        ? e.message
        : String(e)
      await sendMessageToCurrentChat(`转换失败：${msg}`)
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }

    if (conversionSucceeded || timedOut) {
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
