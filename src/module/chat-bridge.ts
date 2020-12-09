import bot from '../interface/bot'
import promiseRetry from 'promise-retry'

const list = [{
  from: -1001465692020,
  to: 1244020370
}]

bot.on('message', (ctx) => {
  const message = ctx.update.message
  for (const entity of list) {
    if (message?.chat.id === entity.from && message.from) {
      promiseRetry((retry, number) => ctx.telegram.forwardMessage(entity.to, message.chat.id, message.message_id).catch((e) => {
        retry(e)
        console.log(e)
        console.log(`Attempting to retry ${number}`)
      })
      ).then()
    }
  }
})
