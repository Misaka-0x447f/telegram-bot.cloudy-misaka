import { getTelegramBotByAnyBotName } from '../interface/telegram'
import store, { storeMethods } from '../store/runtime'
import { getUnixTimeStamp, rand, sleep } from '../utils/lang'
import promiseRetry from 'promise-retry'
import { Message } from 'telegram-typings'
import configFile from '../utils/configFile'
import { UnixTimeStamp } from '../utils/type'

const lastRepeatTime: Record<number, UnixTimeStamp> = {}

for (const [botName, _] of Object.entries(configFile.entries.master.repeater)) {
  const bot = getTelegramBotByAnyBotName(botName)
  // passive repeater functions
  bot.message.sub(async ({ ctx, message, currentChat }) => {
    const chatId = currentChat.id
    if (!chatId) return
    storeMethods.createChatHistoryIfNX(chatId)
    const createDigest = (message: Message) =>
      // @ts-ignore
      (message?.sticker?.file_unique_id || '') + message.text
    const createMessageHistory = store.chatHistory[chatId].createMessageHistory
    createMessageHistory({
      digest: createDigest(message),
      from: message.from?.username || '',
    })
    const historyObject = store.chatHistory[chatId].messageHistory
    let sameMessageCount = 0 // starts from -1, if no messages same return 0, if nothing to compare return -1.
    for (let i = 1; i < historyObject.length; i++) {
      if (historyObject[i].digest === historyObject[i - 1].digest) {
        sameMessageCount++
      } else {
        break
      }
      if (historyObject[i].from === bot.bot.options.username) {
        // prevent repeat too many times.
        sameMessageCount = -1
        break
      }
    }
    const messageLength = ctx.message?.text?.length || 0
    const messageLengthBonusDef = [0, 100, 70, 40, 10, 4].map((el) => el * 0.02)
    const messageLengthBonus =
      messageLength >= messageLengthBonusDef.length
        ? -100
        : messageLengthBonusDef[messageLength] || 0
    const hasPhoto = ctx.message?.photo ? -100 : 0
    const hasSticker = ctx.message?.sticker ? -100 : 0
    const hasDocument = ctx.message?.document ? -100 : 0
    const forwardCounterBonus = [2, 1.5, 0.9, 0.4, 0]
    const forwardCounterBonusChance =
      (5 - messageLength) *
      (forwardCounterBonus[store.chatHistory[chatId].nonRepeatCounter] || 0)
    const chance =
      (messageLengthBonus +
        hasPhoto +
        hasSticker +
        hasDocument +
        forwardCounterBonusChance) *
      Math.min(
        (getUnixTimeStamp() - (lastRepeatTime[chatId] || 0)) / 1800000,
        1
      )
    if (rand(0, 100) < chance || sameMessageCount === 1) {
      if (message) {
        store.chatHistory[chatId].nonRepeatCounter = 0
        lastRepeatTime[chatId] = getUnixTimeStamp()
        await sleep(rand(2000, 5000))
        await ctx.telegram.sendCopy(message.chat.id, message)
        createMessageHistory({
          digest: createDigest(message),
          from: bot.bot.options.username || '',
        })
      }
    } else {
      store.chatHistory[chatId].nonRepeatCounter++
    }
  })
  // active repeater functions
  bot.message.sub(async ({ ctx, message, currentChat }) => {
    const targetMessageId = message?.reply_to_message?.message_id
    const chatId = currentChat?.id
    if (!(message?.reply_to_message && message?.text?.match(/复读/))) return
    if (!chatId) return
    if (!targetMessageId) {
      await ctx.telegram.sendMessage(chatId, '目标消息被吃掉啦')
      return
    }
    promiseRetry((retry, number) =>
      ctx.telegram
        .forwardMessage(chatId, chatId, targetMessageId)
        .catch((e) => {
          retry(e)
          console.log(e)
          console.log(`Attempting to retry ${number}`)
        })
    ).then()
  })
}
