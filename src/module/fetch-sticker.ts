import {
  BotType,
  getTelegramBotByAnyBotName,
  TelegrafEventBusListenerType
} from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
import persistConfig from '../utils/persistConfig'
import { downloadStream } from '../utils/file'

const paramDefinition = { replyMessageType: '贴纸。' }

const createWorker = (worker: BotType) => {
  const sendSticker: (
    fileId: string | undefined
  ) => TelegrafEventBusListenerType =
    (fileId) =>
      async ({ currentChatId, sendMessageToCurrentChat }) => {
        if (!fileId) {
          await sendMessageToCurrentChat('File not found.')
          return
        }
        worker.instance.telegram
          .sendChatAction(currentChatId, 'upload_photo')
          .then()
        const fileLink = await worker.instance.telegram.getFileLink(fileId)
        const stream = await downloadStream(fileLink)
        await worker.instance.telegram.sendPhoto(currentChatId, {
          source: stream
        })
      }
  worker.command.sub(async (p) => {
    const { ctx, sendMessageToCurrentChat, commandName } = p
    if (commandName !== 'fetch_sticker') return
    if (!ctx.message?.reply_to_message) {
      await sendMessageToCurrentChat(
        errorMessages.illegalReplyMessageCount(paramDefinition)
      )
      return
    }
    if (!ctx.message.reply_to_message.sticker) {
      await sendMessageToCurrentChat(
        errorMessages.illegalReplyMessage(paramDefinition)
      )
    }
    sendSticker(ctx.message?.reply_to_message?.sticker?.file_id)(p)
  })
  worker.message.sub(async (p) => {
    const { ctx, replyToCommand, sendMessageToCurrentChat } = p
    if (replyToCommand !== 'fetch_sticker') return
    if (!ctx.message?.sticker) {
      await sendMessageToCurrentChat(
        errorMessages.illegalReplyMessage(paramDefinition)
      )
      return
    }
    sendSticker(ctx.message.sticker.file_id)(p)
  })
}

const config = persistConfig.entries.fetchSticker

Object.keys(config).forEach((botName) =>
  createWorker(getTelegramBotByAnyBotName(botName))
)
