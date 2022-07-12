import promiseRetry from 'promise-retry'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import persistConfig from '../utils/persistConfig'

for (const [botName, config] of Object.entries(persistConfig.entries.chatBridge)) {
  getTelegramBotByAnyBotName(botName).message.sub(async ({ ctx, message }) => {
    for (const entity of config.list) {
      if (message?.chat.id === entity.from && message.from) {
        promiseRetry((retry, number) =>
          ctx.telegram
            .forwardMessage(entity.to, message.chat.id, message.message_id)
            .catch((e) => {
              retry(e)
              console.log(e)
              console.log(`Attempting to retry ${number}`)
            })
        ).then()
      }
    }
  })
}
