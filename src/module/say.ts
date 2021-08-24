import configFile from '../utils/configFile'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
import { isNumeric, stringify } from '../utils/lang'
import { Chat } from 'telegraf/typings/telegram-types'

const configs = configFile.entries.master.say

const chatInfoString = (chat: Chat) =>
  [
    `from: ${chat.first_name || chat.title} ${chat.last_name || ''}`,
    ...(chat.username ? [`userName: ${chat.username}`] : []),
  ].join('\n')

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.message.sub(async ({ message, currentChat, meta }) => {
    if (!config.allowUsersCanReceiveReply || config.allowUser?.includes(currentChat.id)) return
    if (
      (message.reply_to_message &&
        message.reply_to_message?.from?.username === bot.username) ||
      message.chat.type === 'private'
    ) {
      const sourceString = config.list.find((el) => el.id === meta.chatId)?.name

      config.allowUser?.forEach(async (el) => {
        await bot.forwardMessage(el, meta.chatId, message.message_id)
        if (sourceString) await bot.sendMessage(el, sourceString)
        else await bot.sendMessage(el, chatInfoString(currentChat))
      })
    }
  })
  bot.command.sub(async ({ ctx, meta: { commandName, args } }) => {
    const paramDefinition = {
      argumentList: [
        {
          name: 'contact',
          acceptable: `发送目标。可以是以下任意字符串或任意 ChatId：${config.list
            .map((el) => el.name)
            .join(', ')}`,
        },
      ],
      replyMessageType: '发送内容。',
    }
    const chatId = ctx.message?.chat.id!
    if (commandName !== 'say' || !chatId) return
    if (config.allowUser && !config.allowUser.includes(chatId)) {
      await bot.sendMessage(chatId, 'Permission denied.')
      return
    }
    if (!isNumeric(args[0]) && !config.list.find((el) => args[0] === el.name)) {
      await bot.sendMessage(
        chatId,
        errorMessages.illegalArguments(paramDefinition)
      )
      return
    }
    const predefinedTarget = config.list.find((el) => el.name === args[0])?.id
    if (!ctx.message?.reply_to_message) {
      await bot.sendMessage(
        chatId,
        errorMessages.illegalReplyMessageCount(paramDefinition)
      )
      return
    }
    const result = await ctx.telegram.sendCopy(
      predefinedTarget || args[0],
      ctx.message?.reply_to_message
    )
    await bot.sendMessage(chatId, stringify(result))
  })
}
