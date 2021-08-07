import configFile from '../utils/configFile'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import errorMessages from '../utils/errorMessages'

const configs = configFile.entries.master.say

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, meta: { commandName, args } }) => {
    const paramDefinition = {
      argumentList: [
        {
          name: 'contact',
          acceptable: `发送目标。可以是以下任意字符串：${config.list
            .map((el) => el.name)
            .join(', ')}`,
        },
      ],
      replyMessageType: '发送内容。',
    }
    const chatId = ctx.message?.chat.id!
    if (commandName !== 'say' || !chatId) return
    if (config.allowUser && !config.allowUser.includes(chatId)) {
      await bot.sendMessage(chatId, 'Permission denied.')
      return
    }
    for (const to of config.list) {
      if (to.name === args[0]) {
        if (!ctx.message?.reply_to_message) {
          await bot.sendMessage(chatId, errorMessages.illegalReplyMessageCount(paramDefinition))
          return
        }
        await ctx.telegram.sendCopy(to.id, ctx.message?.reply_to_message)
        await bot.sendMessage(chatId, `success.`)
        return
      }
    }
    await bot.sendMessage(
      chatId,
      errorMessages.illegalArguments(paramDefinition)
    )
  })
}
