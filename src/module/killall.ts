import { getTelegramBotByAnyBotName } from '../interface/telegram'
import persistConfig from '../utils/persistConfig'
import { sleep } from '../utils/lang'

const configs = persistConfig.entries?.killall

for (const tokens of persistConfig.entries.tokenTelegram) {
  const botName = tokens.name
  const bot = getTelegramBotByAnyBotName(botName)
  bot.message.sub(async ({ message, currentChat }) => {
    if (!configs) {
      await bot.sendMessage(currentChat.id, 'No superuser configured.').then()
    }
    const isKill =
      (message.text?.includes('/killall') && message.chat.type === 'private') ||
      (message.text?.includes(`/killall@${bot.username}`) &&
        message.chat.type !== 'private')
    if (!isKill) return
    if (!message.from?.id || !configs.superusers?.includes(message.from?.id)) {
      await bot.sendMessage(currentChat.id, 'You are not in the sudoers file. This incident will be reported.').then()
      return
    }
    await bot.sendMessage(currentChat.id, 'Killing all telegram bot...').then()
    await sleep(1000)
    process.exit(1)
  })
}
