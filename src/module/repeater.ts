import { getTelegramBotByAnyBotName } from '../interface/telegram'
import store, { storeMethods } from '../store/runtime'
import { getUnixTimeStamp, rand, sha1, sleep } from '../utils/lang'
import promiseRetry from 'promise-retry'
import { Message } from 'telegram-typings'
import configFile from '../utils/configFile'
import { UnixTimeStamp } from '../utils/type'
import { isNull } from 'lodash-es'

const lastRepeatTime: Record<number, UnixTimeStamp> = {}

for (const [botName, _] of Object.entries(configFile.entries.master.repeater)) {
  const bot = getTelegramBotByAnyBotName(botName)
  // passive repeater functions
  bot.message.sub(async ({ ctx, message, currentChat }) => {
    const chatId = currentChat.id
    if (!chatId) return
    storeMethods.createChatHistoryIfNX(chatId)
    const createDigest = (message: Message) => {
      const res = [
        message?.sticker?.file_id,
        message?.photo?.map((el) => el?.file_id).join(','),
        message?.document?.file_id,
        message?.voice?.file_id,
        message.text,
      ].map((el) => (el ? sha1(el) : null))
      if (res.every(isNull)) {
        return null
      }
      return JSON.stringify(res)
    }
    const createMessageHistory = store.chatHistory[chatId].createMessageHistory
    createMessageHistory({
      digest: createDigest(message),
      from: message.from?.username || '',
    })
    const historyObject = store.chatHistory[chatId].messageHistory
    let sameMessageCount = 0 // starts from -1, if no messages same return 0, if nothing to compare return -1.
    for (let i = 1; i < historyObject.length; i++) {
      console.log(historyObject[i].from, bot.bot.options.username)
      if (historyObject[i].from === bot.bot.options.username) {
        // prevent repeat too many times.
        sameMessageCount = -1
        break
      }
      if (historyObject[i] && historyObject[i].digest === historyObject[i - 1].digest) {
        sameMessageCount++
      } else {
        break
      }
    }
    const messageLength = ctx.message?.text?.length || 0
    const messageLengthBonusDef = [0, 100, 70, 40, 10, 4].map((el) => el * 0.02)
    const messageLengthBonus =
      messageLength >= messageLengthBonusDef.length
        ? -100
        : messageLengthBonusDef[messageLength] || 0
    const hasPhoto = ctx.message?.photo ? -Infinity : 0
    const hasSticker = ctx.message?.sticker ? -Infinity : 0
    const hasDocument = ctx.message?.document ? -Infinity : 0
    const forwardCounterBonus = [2, 1.5, 0.9, 0.4, 0]
    const forwardCounterBonusChance =
      (5 - messageLength) *
      (forwardCounterBonus[store.chatHistory[chatId].nonRepeatCounter] || 0)
    console.log(createDigest(message))
    console.log(sameMessageCount)
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
    if (chance > rand(0, 100) || sameMessageCount === 1) {
      if (message) {
        store.chatHistory[chatId].nonRepeatCounter = 0
        lastRepeatTime[chatId] = getUnixTimeStamp()
        await sleep(rand(2000, 5000))
        await ctx.telegram.sendCopy(message.chat.id, message)
        // create history for bot itself.
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
