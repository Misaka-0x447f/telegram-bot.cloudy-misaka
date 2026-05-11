import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { getUnixTimeStamp, rand, sha1, sleep } from '../utils/lang'
import { Message } from 'telegram-typings'
import persistConfig from '../utils/persistConfig'
import { UnixTimeStampMilli } from "../utils/type";
import { isNull, isUndefined } from 'lodash-es'

type MessageHistory = { digest: string | null; from: string }

const messageCountStorage = {} as Record<number,
    {
      nonRepeatCounter: number
      messageHistory: Array<MessageHistory>
      createMessageHistory: (el: MessageHistory) => void
      lastUpdate: UnixTimeStampMilli
      lastRepeatTime: UnixTimeStampMilli
    }>

const TTL = 3600 * 1000
const MAX_PASSIVE_REPEAT_TEXT_LENGTH = 5
const passiveRepeatLengthBonus = [0, 0.08, 0.2, 0.8, 1.4, 2]
const passiveRepeatBlockedLinkPattern = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i
const passiveRepeatBlockedEntityTypes = ['mention', 'url', 'text_link', 'text_mention']

const canPassivelyRepeatMessage = (message: Message) => {
  const text = message.text || ''
  const hasBlockedEntity = (message.entities || []).some((entity) =>
    passiveRepeatBlockedEntityTypes.includes(entity.type)
  )

  return Boolean(text) &&
    text.length <= MAX_PASSIVE_REPEAT_TEXT_LENGTH &&
    !message.photo &&
    !message.sticker &&
    !message.document &&
    !message.voice &&
    !text.includes('@') &&
    !passiveRepeatBlockedLinkPattern.test(text) &&
    !hasBlockedEntity
}

const cleanStorage = () => {
  const now = getUnixTimeStamp()
  for (const chatId in messageCountStorage) {
    if (now - messageCountStorage[chatId].lastUpdate > TTL) {
      delete messageCountStorage[chatId]
    }
  }
}

const createChatHistoryIfNX = (chatId: number) => {
  cleanStorage()
  if (!isUndefined(messageCountStorage[chatId])) {
    messageCountStorage[chatId].lastUpdate = getUnixTimeStamp()
    return
  }
  const history: MessageHistory[] = []
  messageCountStorage[chatId] = {
    nonRepeatCounter: Infinity,
    messageHistory: history,
    lastUpdate: getUnixTimeStamp(),
    lastRepeatTime: 0,
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
    const messageText = ctx.message?.text || ''
    const messageLength = messageText.length
    const canPassivelyRepeat = canPassivelyRepeatMessage(message)
    const messageLengthBonus =
      canPassivelyRepeat
        ? passiveRepeatLengthBonus[messageLength] || 0
        : -Infinity
    const forwardCounterBonus = [2, 1.5, 0.9, 0.4, 0]
    const forwardCounterBonusChance =
      canPassivelyRepeat
        ? messageLength *
          (forwardCounterBonus[messageCountStorage[currentChatId].nonRepeatCounter] || 0)
        : -Infinity
    const chance =
      (messageLengthBonus +
        forwardCounterBonusChance) *
      Math.min(
        (getUnixTimeStamp() - (messageCountStorage[currentChatId].lastRepeatTime || 0)) / 1800000,
        1
      )
    const shouldRepeatSameMessage = canPassivelyRepeat && sameMessageCount === 1
    if (chance > rand(0, 100) || shouldRepeatSameMessage) {
      if (message) {
        messageCountStorage[currentChatId].nonRepeatCounter = 0
        messageCountStorage[currentChatId].lastRepeatTime = getUnixTimeStamp()
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
    if (!(targetMessage && message?.text === '复读')) return
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
