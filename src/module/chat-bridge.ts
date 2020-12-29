import promiseRetry from 'promise-retry'
import { rand, sleep } from '../utils/lang'
import store from '../store'
import { eventBus } from '../interface/bot'

const list = [{
  from: -1001465692020,
  to: 1244020370
}]

// forwarding functions
eventBus.message.sub(async ({ ctx, message }) => {
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
// passive repeater functions
eventBus.message.sub(async ({ ctx, message }) => {
  // if no message body skip this
  const messageLength = ctx.message?.text?.length || 0
  const messageLengthBonusDef = [0, 5, 3.5, 2.4, 0.8, 0.2]
  const messageLengthBonus = messageLength >= messageLengthBonusDef.length ? -100 : (messageLengthBonusDef[messageLength] || 0)
  const hasPhoto = ctx.message?.photo ? -3 : 0
  const hasSticker = ctx.message?.sticker ? 7 : 0
  const hasDocument = ctx.message?.document ? -100 : 0
  const forwardCounterBonus = [5, 2.5, 1, 0.4, 0.1]
  const forwardCounterBonusChance = (5 - messageLength) * (forwardCounterBonus[store.selfForwardCounter] || 0)
  const chance = messageLengthBonus + hasPhoto + hasSticker + hasDocument + forwardCounterBonusChance
  console.log(`chance: ${chance}`)
  if (rand(0, 100) < chance) {
    console.log('triggered')
    await sleep(rand(2, 5))
    if (message) {
      await ctx.telegram.forwardMessage(message.chat.id, message.chat.id, message.message_id)
    }
    store.selfForwardCounter = 0
  } else {
    store.selfForwardCounter++
  }
})
// active repeater functions
eventBus.message.sub(async ({ ctx, message, currentChat }) => {
  const targetMessageId = message?.reply_to_message?.message_id
  const chatId = currentChat?.id
  if (!(message?.reply_to_message && message?.text?.match(/复读|转发|@Misaka_0x447f_bot/))) return
  if (!chatId) return
  if (!targetMessageId) {
    await ctx.telegram.sendMessage(chatId, '目标消息被吃掉啦')
    return
  }
  promiseRetry((retry, number) => ctx.telegram.forwardMessage(chatId, chatId, targetMessageId).catch((e) => {
    retry(e)
    console.log(e)
    console.log(`Attempting to retry ${number}`)
  })
  ).then()
})
// start functions
eventBus.message.sub(async ({ ctx, message }) => {
  if (message?.text === '/start' && message.chat.type === 'private') {
    await sleep(rand(1000, 2000))
    await ctx.telegram.sendMessage(message.chat.id, 'Emmm')
    await sleep(rand(3000, 7000))
    await ctx.telegram.sendMessage(message.chat.id, 'Hi? Misaka is just a bot that not connected to a misaka intelligence processor, so you need to reach out the misaka who has write permission to me at t.me/Misaka_0x447f')
    await sleep(rand(3000, 5000))
    await ctx.telegram.forwardMessage(message.chat.id, 143847141, 237)
  }
})
// ping
eventBus.message.sub(async ({ ctx, message, currentChat }) => {
  const isPing = (message.text?.includes('/ping') && message.chat.type === 'private') ||
    (message.text?.includes('/ping@Misaka_0x447f_bot') && message.chat.type !== 'private')
  if (isPing) {
    promiseRetry((retry, number) => ctx.telegram.sendMessage(currentChat.id, `Alive until sunset. \n${new Date().toUTCString()}`)
      .catch((e) => {
        retry(e)
        console.log(e)
        console.log(`Attempting to retry ${number}`)
      }), { maxRetryTime: 10000 }
    ).then()
  }
})
