import { getTelegramBotByAnyBotName } from "../interface/telegram";
import configFile from "../utils/configFile";

for (const [botName, config] of Object.entries(configFile.entries.master.start)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, commandName }) => {
    if (commandName !== 'start' || !ctx.message) return
    await bot.runActions(config.actions, {defaultChatId: ctx.message.chat.id})
  })
}
