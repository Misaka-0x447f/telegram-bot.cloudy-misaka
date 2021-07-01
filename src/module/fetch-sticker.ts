import bot, { BotType } from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
// import * as os from 'os'
// import { download } from '../utils/file'
// import * as fs from 'fs'
// import execa from 'execa'
// import * as path from 'path'
// @ts-ignore
// import dwebpName from '../../bin/dwebp-1.2.0-rc3.binary'

const createWorker = (worker: BotType) =>
  worker.command.sub(async ({ ctx, meta }) => {
    if (meta.commandName !== 'fetch_sticker') return
    if (!ctx.message?.reply_to_message) {
      errorMessages.tooFewArguments(1, 0)
      return
    }
    if (!ctx.message.reply_to_message.sticker) {
      errorMessages.unexpectedArguments([
        { name: 'sticker', acceptable: '任意贴纸。' },
      ])
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

createWorker(bot.misaka)
