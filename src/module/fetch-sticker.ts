import { BotType, getTelegramBotByAnyBotName } from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
import configFile from '../utils/configFile'
import { downloadStream } from "../utils/file";
const paramDefinition = { replyMessageType: '贴纸。' }

const createWorker = (worker: BotType) =>
  worker.command.sub(async ({ ctx, currentChatId, sendMessageToCurrentChat, commandName }) => {
    if (commandName !== 'fetch_sticker') return
    if (!ctx.message?.reply_to_message) {
      await sendMessageToCurrentChat(errorMessages.illegalReplyMessageCount(paramDefinition))
      return
    }
    if (!ctx.message.reply_to_message.sticker) {
      await sendMessageToCurrentChat(errorMessages.illegalReplyMessage(paramDefinition))
    }
    const fileId = ctx.message.reply_to_message.sticker?.file_id
    if (!fileId) {
      await sendMessageToCurrentChat('File not found.')
      return
    }
    worker.instance.telegram.sendChatAction(currentChatId, 'upload_photo').then()
    const fileLink = await worker.instance.telegram.getFileLink(fileId)
    const stream = await downloadStream(fileLink)
    await worker.instance.telegram.sendPhoto(currentChatId, {source: stream})
  })

const config = configFile.entries.master.fetchSticker

Object.keys(config).forEach((botName) =>
  createWorker(getTelegramBotByAnyBotName(botName))
)
