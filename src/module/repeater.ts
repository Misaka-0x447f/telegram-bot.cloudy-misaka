import bot from '../interface/bot'
import store, { storeMethods } from '../store'
import { rand, sleep } from '../utils/lang'
import promiseRetry from 'promise-retry'
import { Message } from 'telegram-typings'

// passive repeater functions
bot.misaka.message.sub(async ({ ctx, message, currentChat }) => {
  const chatId = currentChat.id
  if (!chatId) return
  storeMethods.createChatHistoryIfNX(chatId)
  const createDigest = (message: Message) =>
    (message.sticker?.file_id || '') + message.text
  const createMessageHistory = store.chatHistory[chatId].createMessageHistory
  createMessageHistory({
    digest: createDigest(message),
    from: message.from?.username || '',
  })
  const historyObject = store.chatHistory[chatId].messageHistory
  let sameMessageCount = 0 // starts from -1, if no messages same return 0, if nothing to compare return -1.
  console.log(historyObject)
  for (let i = 1; i < historyObject.length; i++) {
    if (historyObject[i].digest === historyObject[i - 1].digest) {
      sameMessageCount++
    } else {
      break
    }
    if (historyObject[i].from === bot.misaka.bot.options.username) {
      // prevent repeat too many times.
      sameMessageCount = -1
      break
    }
  }
  console.log(sameMessageCount)
  const messageLength = ctx.message?.text?.length || 0
  const messageLengthBonusDef = [0, 5, 3.5, 2.4, 0.8, 0.2]
  const messageLengthBonus =
    messageLength >= messageLengthBonusDef.length
      ? -100
      : messageLengthBonusDef[messageLength] || 0
  const hasPhoto = ctx.message?.photo ? -100 : 0
  const hasSticker = ctx.message?.sticker ? 7 : 0
  const hasDocument = ctx.message?.document ? -100 : 0
  const forwardCounterBonus = [5, 2.5, 1, 0.4, 0.1]
  const forwardCounterBonusChance =
    (5 - messageLength) *
    (forwardCounterBonus[store.chatHistory[chatId].nonRepeatCounter] || 0)
  const chance =
    messageLengthBonus +
    hasPhoto +
    hasSticker +
    hasDocument +
    forwardCounterBonusChance
  console.log(`chance: ${chance}`)
  if (rand(0, 100) < chance || sameMessageCount === 1) {
    console.log('triggered')
    await sleep(rand(2, 5))
    if (message) {
      await ctx.telegram.sendCopy(message.chat.id, message)
      createMessageHistory({
        digest: createDigest(message),
        from: bot.misaka.bot.options.username || '',
      })
    }
    store.chatHistory[chatId].nonRepeatCounter = 0
  } else {
    store.chatHistory[chatId].nonRepeatCounter++
  }
})
// active repeater functions
bot.misaka.message.sub(async ({ ctx, message, currentChat }) => {
  const targetMessageId = message?.reply_to_message?.message_id
  const chatId = currentChat?.id
  if (
    !(
      message?.reply_to_message &&
      message?.text?.match(/复读|转发|repeat|@Misaka_0x447f_bot/)
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

console.log('repeater ready.')
