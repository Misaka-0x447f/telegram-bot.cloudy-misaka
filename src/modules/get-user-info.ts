import persistConfig from '../utils/persistConfig'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import * as tt from 'telegraf/typings/telegram-types'
import errorMessages from '../utils/errorMessages'
import { isNumeric } from '../utils/lang'
import { Message } from 'telegram-typings'

// 依赖里的 Message 类型早于论坛话题（2022），没有 message_thread_id；运行时该字段存在，
// 这里局部补类型后读取，避免升级整套 typings。
type MessageWithTopic = Message & { message_thread_id?: number }

// 论坛超级群的 General 话题在 incoming update 上以 id 1 表示。它不是可寻址的真实话题
// （Bot API 拒绝以 message_thread_id=1 发送），所以单独提示，避免被当成发送目标。
const GENERAL_TOPIC_ID = 1

const topicIdLines = (message: Message) => {
  const topicId = (message as MessageWithTopic).message_thread_id
  if (topicId === undefined) return []
  if (topicId === GENERAL_TOPIC_ID) return ['topicId: (General 无话题 id)']
  return [`topicId: ${topicId}`]
}

const chatIdInfo = (chat: tt.Chat, extraLines: string[] = []) =>
  [
    `Hi ${chat.first_name || chat.title} ${chat.last_name || ''}`,
    `chatId: ${chat.id}`,
    ...(chat.username ? [`userName: ${chat.username}`] : []),
    `chatType: ${chat.type}`,
    ...extraLines
  ].join('\n')

const paramDefinition = {
  argumentList: [
    {
      name: 'chatId?',
      acceptable: '可选的 chatId。如不指定，则查询当前 chat。'
    }
  ]
}

for (const botName of Object.keys(persistConfig.entries.getUserInfo)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(
    async ({ ctx, args, commandName, message, sendMessageToCurrentChat }) => {
      if (commandName !== 'whoareyou' || !ctx.chat) return
      if (args[0]?.match(/^(\d+|\w+)$/)) {
        await sendMessageToCurrentChat('正在查询')
        const chatInfo = await bot.instance.telegram.getChat(
          isNumeric(args[0]) ? parseInt(args[0]) : `@${args[0]}`
        ).catch(e => {
          if (e.description === 'Bad Request: chat not found') {
            sendMessageToCurrentChat(
              '会话不存在。如要查询用户名，请用格式 @<publicName>。请注意，如果我没有加入目标群或者没有和目标用户对话过，则无法查询到信息。'
            )
          } else {
            sendMessageToCurrentChat(JSON.stringify(e))
          }
          return null
        })
        if (chatInfo) await sendMessageToCurrentChat(chatIdInfo(chatInfo))
      } else if (!args[0]) {
        await sendMessageToCurrentChat('正在查询')
        await sendMessageToCurrentChat(chatIdInfo(ctx.chat, topicIdLines(message)))
      } else {
        await sendMessageToCurrentChat(
          errorMessages.illegalArguments(paramDefinition)
        )
      }
    }
  )
}
