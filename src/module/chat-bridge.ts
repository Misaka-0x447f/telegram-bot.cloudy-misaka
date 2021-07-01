import promiseRetry from 'promise-retry'
import bot from '../interface/telegram'

const list = [
  {
    from: -1001465692020,
    to: 1244020370,
  },
]

// forwarding functions
bot.misaka.message.sub(async ({ ctx, message }) => {
  for (const entity of list) {
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

