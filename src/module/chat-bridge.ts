import promiseRetry from 'promise-retry'
import { rand, sleep } from '../utils/lang'
import store from '../store'
import { eventBus } from '../interface/bot'

const list = [
  {
    from: -1001465692020,
    to: 1244020370,
  },
]

// forwarding functions
eventBus.message.sub(async ({ ctx, message }) => {
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
// passive repeater functions
eventBus.message.sub(async ({ ctx, message }) => {
  // if no message body skip this
  const messageLength = ctx.message?.text?.length || 0
  const messageLengthBonusDef = [0, 5, 3.5, 2.4, 0.8, 0.2]
  const messageLengthBonus =
    messageLength >= messageLengthBonusDef.length
      ? -100
      : messageLengthBonusDef[messageLength] || 0
  const hasPhoto = ctx.message?.photo ? -3 : 0
  const hasSticker = ctx.message?.sticker ? 7 : 0
  const hasDocument = ctx.message?.document ? -100 : 0
  const forwardCounterBonus = [5, 2.5, 1, 0.4, 0.1]
  const forwardCounterBonusChance =
    (5 - messageLength) * (forwardCounterBonus[store.selfForwardCounter] || 0)
  const chance =
    messageLengthBonus +
    hasPhoto +
    hasSticker +
    hasDocument +
    forwardCounterBonusChance
  console.log(`chance: ${chance}`)
  if (rand(0, 100) < chance) {
    console.log('triggered')
    await sleep(rand(2, 5))
    if (message) {
      await ctx.telegram.forwardMessage(
        message.chat.id,
        message.chat.id,
        message.message_id
      )
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
  if (
    !(
      message?.reply_to_message &&
      message?.text?.match(/复读|转发|@Misaka_0x447f_bot/)
    )
  )
    return
  if (!chatId) return
  if (!targetMessageId) {
    await ctx.telegram.sendMessage(chatId, '目标消息被吃掉啦')
    return
  }
  promiseRetry((retry, number) =>
    ctx.telegram.forwardMessage(chatId, chatId, targetMessageId).catch((e) => {
      retry(e)
      console.log(e)
      console.log(`Attempting to retry ${number}`)
    })
  ).then()
})
