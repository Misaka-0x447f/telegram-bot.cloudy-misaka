import configFile from '../utils/configFile'
import telegram from '../interface/telegram'
import { TelegramBotName } from '../utils/type'
import errorMessages from '../utils/errorMessages'

const configs = configFile.entries.master.say

for (const [botName, config] of Object.entries(configs)) {
  const bot = telegram[botName as TelegramBotName]
  bot.command.sub(async ({ ctx, meta }) => {
    const chatId = ctx.message?.chat.id!
    if (meta.commandName !== 'say' || !chatId) return
    if (config.allowUser && !config.allowUser.includes(chatId)) {
      await bot.sendMessage(chatId, 'Permission denied.')
      return
    }
    for (const to of config.list) {
      if (to.name === meta.args[0]) {
        if (!ctx.message?.reply_to_message) {
          await bot.sendMessage(chatId, 'Reply to a message to say.')
          return
        }
        await ctx.telegram.sendCopy(to.id, ctx.message?.reply_to_message)
        await bot.sendMessage(chatId, `success.`)
        return
      }
    }
    await bot.sendMessage(
      chatId,
      errorMessages.unexpectedArguments([
        {
          name: 'contact',
          acceptable: `发送目标。可以是以下任意字符串：${config.list.map(
            (el) => el.name
          ).join(', ')}`,
        },
      ])
    )
  })
}
