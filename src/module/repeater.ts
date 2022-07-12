import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { getUnixTimeStamp, rand, sha1, sleep } from '../utils/lang'
import { Message } from 'telegram-typings'
import persistConfig from '../utils/persistConfig'
import { UnixTimeStamp } from '../utils/type'
import { isNull, isUndefined } from 'lodash-es'

type MessageHistory = { digest: string | null; from: string }

const messageCountStorage = {} as Record<number,
    {
      nonRepeatCounter: number
      messageHistory: Array<MessageHistory>
      // eslint-disable-next-line no-unused-vars
      createMessageHistory: (el: MessageHistory) => void
    }>

const lastRepeatTime: Record < number, UnixTimeStamp > = {}

const createChatHistoryIfNX = (chatId: number) => {
  if (!isUndefined(messageCountStorage[chatId])) return
  const history: MessageHistory[] = []
  messageCountStorage[chatId] = {
    nonRepeatCounter: Infinity,
    messageHistory: history,
    createMessageHistory: (messageHistory) => {
      if (isNull(messageHistory.digest)) return
      history.unshift(messageHistory)
      // splice from 30 to the end of array.
      history.splice(30)
    }
  }
}

for (const [botName, _] of Object.entries(persistConfig.entries.repeater)) {
  const bot = getTelegramBotByAnyBotName(botName)
  // passive repeater functions
  bot.message.sub(async ({ ctx, message, currentChatId }) => {
    if (!currentChatId) return
    createChatHistoryIfNX(currentChatId)
    const createDigest = (message: Message) => {
      const res = [
        message?.sticker?.file_id,
        message?.photo?.map((el) => el?.file_id).join(','),
        message?.document?.file_id,
        message?.voice?.file_id,
        message.text
      ].map((el) => (el ? sha1(el) : null))
      if (res.every(isNull)) {
        return null
      }
      return JSON.stringify(res)
    }
    const createMessageHistory = messageCountStorage[currentChatId].createMessageHistory
    createMessageHistory({
      digest: createDigest(message),
      from: message.from?.username || ''
    })
    const historyObject = messageCountStorage[currentChatId].messageHistory
    let sameMessageCount = 0 // starts from -1, if no messages same return 0, if nothing to compare return -1.
    for (let i = 1; i < historyObject.length; i++) {
      if (historyObject[i].from === bot.username) {
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
      (forwardCounterBonus[messageCountStorage[currentChatId].nonRepeatCounter] || 0)
    const chance =
      (messageLengthBonus +
        hasPhoto +
        hasSticker +
        hasDocument +
        forwardCounterBonusChance) *
      Math.min(
        (getUnixTimeStamp() - (lastRepeatTime[currentChatId] || 0)) / 1800000,
        1
      )
    if (chance > rand(0, 100) || sameMessageCount === 1) {
      if (message) {
        messageCountStorage[currentChatId].nonRepeatCounter = 0
        lastRepeatTime[currentChatId] = getUnixTimeStamp()
        await sleep(rand(2000, 5000))
        // TODO: deprecated api
        await ctx.telegram.sendCopy(message.chat.id, message)
        // create history for bot itself.
        createMessageHistory({
          digest: createDigest(message),
          from: bot.username
        })
      }
    } else {
      messageCountStorage[currentChatId].nonRepeatCounter++
    }
  })
  // active repeater functions
  bot.message.sub(async ({ ctx, message, currentChat }) => {
    const targetMessage = message?.reply_to_message
    const chatId = currentChat?.id
    if (!(targetMessage && message?.text?.match(/复读/))) return
    if (!chatId) return
    if (!targetMessage) {
      await ctx.telegram.sendMessage(chatId, '目标消息被吃掉啦')
      return
    }
    // TODO: deprecated api
    await ctx.telegram.sendCopy(message.chat.id, targetMessage)
    await ctx.telegram.deleteMessage(message.chat.id, message.message_id).catch()
  })
}
