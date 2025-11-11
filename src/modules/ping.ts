import { getTelegramBotByAnyBotName } from '../interface/telegram'
import persistConfig from '../utils/persistConfig'

const configs = persistConfig.entries.ping

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.message.sub(async ({ message, currentChat }) => {
    const isPing =
      (message.text?.includes('/ping') && message.chat.type === 'private') ||
      (message.text?.includes(`/ping@${bot.username}`) &&
        message.chat.type !== 'private')
    if (!isPing) return
    bot.runActions(config.actions, { defaultChatId: currentChat.id }, { utcDate: new Date().toUTCString(), builtString: process.env.BUILT_STRING }).then()
  })
}
