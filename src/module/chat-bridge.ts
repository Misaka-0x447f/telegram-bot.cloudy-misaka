import bot from '../interface/bot'
import promiseRetry from 'promise-retry'
import { rand, sleep } from '../utils/lang'
import store from '../store'

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
  // if no message body skip this
  const messageLength = ctx.message?.text?.length || 0
  const messageLengthBonusDef = [0, 5, 3.5, 2.4, 1.6, 1.2, 0.8, 0.4, 0.2, 0.1]
  const messageLengthBonus = messageLengthBonusDef[messageLength] || 0
  const hasPhoto = ctx.message?.photo ? -3 : 0
  const hasSticker = ctx.message?.sticker ? 7 : 0
  const hasDocument = ctx.message?.document ? -10 : 0
  const forwardCounterBonus = [5, 2.5, 1, 0.4, 0.1]
  const forwardCounterBonusChance = (5 - messageLength) * (forwardCounterBonus[store.selfForwardCounter] || 0)
  const chance = messageLengthBonus + hasPhoto + hasSticker + hasDocument + forwardCounterBonusChance
  if (rand(0, 100) < chance) {
    await sleep(rand(2, 5))
    if (message) {
      await ctx.telegram.forwardMessage(message.chat.id, message.chat.id, message.message_id)
    }
    store.selfForwardCounter = 0
  } else {
    store.selfForwardCounter++
  }
})
