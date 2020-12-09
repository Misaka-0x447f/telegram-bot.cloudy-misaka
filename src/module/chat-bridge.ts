import bot from '../interface/bot'
import promiseRetry from 'promise-retry'
import { sleep } from '../utils/lang'

const list = [{
  from: -1001465692020,
  to: 1244020370
}]

bot.on('message', async (ctx) => {
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
  if (ctx.message?.text === '/start' && ctx.message.chat.type === 'private') {
    await sleep(1000)
    await ctx.telegram.sendMessage(ctx.message.chat.id, 'Emmm')
    await sleep(1000)
    await ctx.telegram.sendMessage(ctx.message.chat.id, 'Hi? Misaka is just a bot that not connected to a misaka intelligence processor, so you need to reach out the misaka who has write permission to me at t.me/Misaka_0x447f')
    await sleep(3000)
    await ctx.telegram.forwardMessage(ctx.message.chat.id, 143847141, 237)
  }
})
