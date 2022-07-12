import { getTelegramBotByAnyBotName } from '../interface/telegram'
import persistConfig from '../utils/persistConfig'

for (const [botName, config] of Object.entries(persistConfig.entries.start)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, commandName }) => {
    if (commandName !== 'start' || !ctx.message) return
    await bot.runActions(config.actions, { defaultChatId: ctx.message.chat.id })
  })
}
