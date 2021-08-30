import configFile from '../utils/configFile'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import errorMessages from '../utils/errorMessages'
import { isNumeric, stringify, tryCatchReturn } from '../utils/lang'
import { Chat } from 'telegraf/typings/telegram-types'
import { Message } from 'telegram-typings'
import formatYaml from 'prettyjson'
import yaml from 'js-yaml'

const configs = configFile.entries.master.say
const replyTargetStore = {
  chatId: null as number | null,
  messageId: null as number | null,
}

const chatInfoString = (chat: Chat, message: Message) =>
  formatYaml.render(
    {
      from: `${chat.first_name || chat.title} ${chat.last_name || ''}`,
      chatId: chat.id,
      messageId: message.message_id,
      userName: chat.username,
    },
    { noColor: true }
  )

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.message.sub(async ({ message, currentChat, meta }) => {
    if (
      !config.allowUsersCanReceiveReply ||
      config.allowUser?.includes(currentChat.id)
    )
      return
    if (
      (message.reply_to_message &&
        message.reply_to_message?.from?.username === bot.username) ||
      message.chat.type === 'private'
    ) {
      const sourceString = config.list.find((el) => el.id === meta.chatId)?.name

      for (const el of config.allowUser || []) {
        await bot.forwardMessage(el, meta.chatId, message.message_id)
        if (sourceString) await bot.sendMessage(el, sourceString)
        else await bot.sendMessage(el, chatInfoString(currentChat, message))
      }
    }
  })
  bot.command.sub(async ({ ctx, meta: { commandName, chatId } }) => {
    const paramDefinition = {
      replyMessageType:
        '以 yaml 格式储存的，包含 chatId 和 messageId 键的消息。',
    }
    if (commandName !== 'sayTarget') return
    const replyTarget = ctx.message?.reply_to_message
    const parseResult = tryCatchReturn(
      () => yaml.load(replyTarget?.text || ''),
      () => ({})
    ) as Record<string, string>
    if (
      !replyTarget ||
      !parseInt(parseResult?.chatId) ||
      !parseInt(parseResult?.messageId)
    ) {
      await bot.sendMessage(
        chatId,
        errorMessages.illegalReplyMessageCount(paramDefinition)
      )
      return
    }
    replyTargetStore.chatId = parseInt(parseResult.chatId)
    replyTargetStore.messageId = parseInt(parseResult.messageId)
  })
  bot.command.sub(async ({ ctx, meta: { commandName, args, chatId } }) => {
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
    await ctx.telegram
      .sendCopy(predefinedTarget || args[0], ctx.message?.reply_to_message, {
        reply_to_message_id: replyTargetStore.messageId,
      })
      .then((res) => bot.sendMessage(chatId, stringify(res)))
      .catch((error) => bot.sendMessage(chatId, stringify(error)))
  })
}
