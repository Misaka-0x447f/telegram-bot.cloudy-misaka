import configFile from '../utils/configFile'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'
import { isNumeric, stringify, tryCatchReturn } from '../utils/lang'
import { Chat } from 'telegraf/typings/telegram-types'
import { Message } from 'telegram-typings'
import formatYaml from 'prettyjson'
import yaml from 'js-yaml'
import { isUndefined, omitBy } from 'lodash-es'

const configs = configFile.entries.master.say
const replyTargetStore = {
  chatId: null as number | null,
  messageId: null as number | null,
}

const chatInfoString = (chat: Chat, message: Message, shortcut?: string) =>
  formatYaml.render(
    omitBy(
      {
        from: `${chat.first_name || chat.title} ${chat.last_name || ''}`,
        chatId: chat.id,
        messageId: message.message_id,
        userName: chat.username,
        shortcut,
      },
      isUndefined
    ),
    { noColor: true }
  )

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.message.sub(async ({ message, currentChat, meta }) => {
    const isPrivate = message.chat.type === 'private'
    if (
      !config.adminChatIdsCanReceiveReply ||
      (config.adminChatIds?.includes(currentChat.id) && isPrivate)
    )
      return
    if (
      (message.reply_to_message &&
        message.reply_to_message?.from?.username === bot.username) ||
      isPrivate
    ) {
      const shortcut = config.list.find((el) => el.id === meta.chatId)?.name

      for (const el of config.adminChatIds || []) {
        await bot.forwardMessage(el, meta.chatId, message.message_id)
        await bot.sendMessage(
          el,
          chatInfoString(currentChat, message, shortcut)
        )
      }
    }
  })
  bot.command.sub(async ({ ctx, meta: { commandName, chatId } }) => {
    const paramDefinition = {
      replyMessageType:
        '以 yaml 格式储存的，包含 chatId 和 messageId 键的消息。这些信息被使用一次后将会从内存中清除。',
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
    await bot.sendMessage(
      chatId,
      `成功。\n${formatYaml.render(replyTargetStore, { noColor: true })}`
    )
  })
  bot.command.sub(async ({ ctx, meta: { commandName, args, chatId } }) => {
    const paramDefinition: ParamsDefinition = {
      argumentList: [
        {
          name: 'contact',
          acceptable: `发送目标。可以是以下任意字符串或任意 ChatId：${config.list
            .map((el) => el.name)
            .join(
              ', '
            )}；如果不指定此参数，则必须先通过 /sayTarget 指令指定发送目标。`,
          optional: true,
        },
      ],
      replyMessageType: '发送内容。',
    }
    if (commandName !== 'say' || !chatId) return
    if (config.adminChatIds && !config.adminChatIds.includes(chatId)) {
      await bot.sendMessage(chatId, 'Permission denied.')
      return
    }
    if (
      !isNumeric(args[0]) &&
      !config.list.find((el) => args[0] === el.name) &&
      !replyTargetStore.chatId
    ) {
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
    try {
      const res = await ctx.telegram.sendCopy(
        replyTargetStore.chatId || predefinedTarget || args[0],
        ctx.message?.reply_to_message,
        replyTargetStore.messageId
          ? {
              reply_to_message_id: replyTargetStore.messageId,
            }
          : {}
      )
      await Promise.all(
        config.adminChatIds?.map((user) =>
          bot.sendMessage(user, stringify(res))
        ) || []
      )
      replyTargetStore.messageId = null
      replyTargetStore.chatId = null
    } catch (e) {
      await bot.sendMessage(chatId, stringify(e))
      console.log(e)
    }
  })
}
