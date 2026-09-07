import { Message } from 'telegram-typings'
import {
  BotType,
  getTelegramBotByAnyBotName,
  TelegrafEventBusListenerType
} from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
import persistConfig from '../utils/persistConfig'
import { downloadStream } from '../utils/file'
import { withProcessingReaction } from '../utils/commandReaction'

const paramDefinition = { replyMessageType: '贴纸。' }

const createWorker = (worker: BotType) => {
  const handle = async (
    source: Message | undefined,
    p: Parameters<TelegrafEventBusListenerType>[0]
  ) => {
    const { currentChatId, sendMessageToCurrentChat } = p
    try {
      if (!source) {
        await sendMessageToCurrentChat(
          errorMessages.illegalReplyMessageCount(paramDefinition)
        )
        return
      }
      if (!source.sticker) {
        await sendMessageToCurrentChat(
          errorMessages.illegalReplyMessage(paramDefinition)
        )
        return
      }
      void worker.instance.telegram.sendChatAction(currentChatId, 'upload_photo')
        .catch(() => {})
      const fileLink = await worker.instance.telegram.getFileLink(source.sticker.file_id)
      const stream = downloadStream(fileLink)
      try {
        await worker.instance.telegram.sendPhoto(currentChatId, { source: stream })
      } finally {
        stream.destroy()
      }
    } catch {
      await sendMessageToCurrentChat('贴纸下载或发送失败，请稍后重试。').catch(() => {})
    }
  }
  worker.command.sub((p) => {
    if (p.commandName !== 'fetch_sticker') return
    return withProcessingReaction(
      worker.instance.telegram, p.currentChatId, p.message.message_id,
      () => handle(p.message.reply_to_message, p)
    )
  })
  worker.message.sub((p) => {
    if (p.replyToCommand !== 'fetch_sticker' || p.isCommand) return
    return withProcessingReaction(
      worker.instance.telegram, p.currentChatId, p.message.reply_to_message?.message_id,
      () => handle(p.message, p)
    )
  })
}

Object.keys(persistConfig.entries.fetchSticker).forEach((botName) =>
  createWorker(getTelegramBotByAnyBotName(botName))
)
