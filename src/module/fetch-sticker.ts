import { BotType, getTelegramBotByAnyBotName } from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
import configFile from '../utils/configFile'
// import * as os from 'os'
// import { download } from '../utils/file'
// import * as fs from 'fs'
// import execa from 'execa'
// import * as path from 'path'
// @ts-ignore
// import dwebpName from '../../bin/dwebp-1.2.0-rc3.binary'

const paramDefinition = { replyMessageType: '贴纸。' }

const createWorker = (worker: BotType) =>
  worker.command.sub(async ({ ctx, meta }) => {
    if (meta.commandName !== 'fetch_sticker') return
    if (!ctx.message?.reply_to_message) {
      errorMessages.illegalReplyMessageCount(paramDefinition)
      return
    }
    if (!ctx.message.reply_to_message.sticker) {
      errorMessages.illegalReplyMessage(paramDefinition)
    }
    const fileId = ctx.message.reply_to_message.sticker?.file_id
    if (!fileId) {
      await worker.sendMessage(meta.chatId, 'File not found.')
      return
    }
    const fileLink = await worker.bot.telegram.getFileLink(fileId)
    // const filePath = path.join(
    //   os.tmpdir(),
    //   `telegram-${meta.chatId}-${ctx.message.message_id.toString()}.webp`
    // )
    // const targetFilePath = path.join(
    //   os.tmpdir(),
    //   `telegram-${meta.chatId}-${ctx.message.message_id.toString()}.png`
    // )
    await worker.sendMessage(meta.chatId, fileLink)
    // await download(fileLink, filePath)
    // fs.chmodSync(path.join(__dirname, dwebpName), '755')
    // execa(path.join(__dirname, dwebpName), ['-o', targetFilePath, filePath])
    // await ctx.telegram.sendPhoto(meta.chatId, targetFilePath)
    // fs.unlinkSync(targetFilePath)
  })

const config = configFile.entries.master.fetchSticker

Object.keys(config).forEach((botName) =>
  createWorker(getTelegramBotByAnyBotName(botName))
)
