import promiseRetry from 'promise-retry'
import persistConfig from './persistConfig'
import { Message } from 'telegram-typings'

type SpamEvent = {
  ts: number
  botName: string
  chatId: number
  messageId: number
  message?: Message
}

// In-memory buffer of spam events
const spamBuffer: SpamEvent[] = []

// Keep events only for the past hour to cap memory usage
const ONE_HOUR = 60 * 60 * 1000

const pruneOld = (now = Date.now()) => {
  const cutoff = now - ONE_HOUR
  // Remove in-place to avoid reallocations
  let write = 0
  for (let read = 0; read < spamBuffer.length; read++) {
    if (spamBuffer[read].ts >= cutoff) {
      spamBuffer[write++] = spamBuffer[read]
    }
  }
  spamBuffer.length = write
}

/**
 * 记录一条垃圾信息（完整消息对象保存在内存中）。
 * 注意：仅存于内存，进程重启会丢失。
 */
export const recordSpam = (
  botName: string,
  chatId: number,
  messageId: number,
  message?: Message,
) => {
  spamBuffer.push({ ts: Date.now(), botName, chatId, messageId, message })
}

// Select up to k random items using reservoir sampling
const pickRandomK = <T,>(arr: T[], k: number): T[] => {
  const n = arr.length
  if (n <= k) return arr.slice()
  const reservoir: T[] = arr.slice(0, k)
  for (let i = k; i < n; i++) {
    const j = Math.floor(Math.random() * (i + 1))
    if (j < k) reservoir[j] = arr[i]
  }
  return reservoir
}

const sendReportText = async (text: string) => {
  const targets = persistConfig.entries.insight.telegramSupervisor || []
  if (!targets.length) return
  await Promise.all(
    targets.map((target: number | string) =>
      promiseRetry(async (retry) =>
        (await import('../interface/telegram')).exportBot.misaka.instance.telegram
          .sendMessage(target, text)
          .catch(retry)
      ).then()
    )
  )
}

const buildAndSendHourlyReport = async () => {
  const now = Date.now()
  pruneOld(now)
  const lastHourEvents = spamBuffer.filter((e) => e.ts >= now - ONE_HOUR)
  const count = lastHourEvents.length
  const samples = pickRandomK(lastHourEvents, 10)

  // 先发统计文案
  await sendReportText(`Spam summary in past 1 hour: ${count}\nSamples (forwarded up to 10 below)`)

  if (!samples.length) return

  // 转发样本到遥测频道
  const targets = persistConfig.entries.insight.telegramSupervisor || []
  if (!targets.length) return

  for (const event of samples) {
    for (const target of targets) {
      await promiseRetry(async (retry) => {
        try {
          const { getTelegramBotByAnyBotName } = await import('../interface/telegram')
          const bot = getTelegramBotByAnyBotName(event.botName)
          await bot.forwardMessage(target, event.chatId, event.messageId)
        } catch {
          // 如果转发失败，降级为发送文本快照
          const snippet = (() => {
            const text = (event.message?.text || (event.message)?.caption || '') as string
            return text ? text.slice(0, 200) : '[no text content]'
          })()
          await (await import('../interface/telegram')).exportBot.misaka.instance.telegram
            .sendMessage(target, `Fallback spam snapshot: bot=${event.botName}, chatId=${event.chatId}, messageId=${event.messageId}\n${snippet}`)
            .catch(retry)
        }
      })
    }
  }
}

// Schedule hourly reports
const startScheduler = () => {
  // First run after 1 hour to cover the first window
  setTimeout(() => {
    buildAndSendHourlyReport().then()
    setInterval(() => buildAndSendHourlyReport().then(), ONE_HOUR)
  }, ONE_HOUR)
}

startScheduler()

export default {
  recordSpam,
}
