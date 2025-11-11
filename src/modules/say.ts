import persistConfig from '../utils/persistConfig'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'
import { isNumeric, stringify, tryCatchReturn } from '../utils/lang'
import { Chat } from 'telegraf/typings/telegram-types'
import { Message } from 'telegram-typings'
import formatYaml from 'prettyjson'
import yaml from 'js-yaml'
import { isUndefined, omitBy } from 'lodash-es'

const configs = persistConfig.entries.say
const replyTargetStore = {
  chatId: null as number | null,
  messageId: null as number | null
}

type ChatInfoParseResult = {
  from: string
  chatId: string
  messageId: string
  userName: string
  link: string
  shortcut?: string
}

const spamPatterns = [
  /(tg|电报|引流|群发|拉人|推广|私信|代开)/i,
  /(担保|彩票|投注|娱乐|分红|工资|返点|返水)/i,
  /(注册链接|登录地址|测速地址|立即体验|老板专用|联系)/i,
  /https?:\/\/[^\s]+/i,
  /t\.me\/[^\s]+/i,
  /@\w{3,}/i,
  /(主营业务|老群|老频道|机器人|会员)/i
]


const chatInfoString = (chat: Chat, message: Message, shortcut?: string) =>
  formatYaml.render(
    omitBy(
      {
        from: `${chat.first_name || chat.title} ${chat.last_name || ''}`,
        chatId: chat.id,
        messageId: message.message_id,
        userName: chat.username,
        link:
          chat.id.toString().startsWith('-100') &&
          `https://t.me/c/${chat.id.toString().substring(4)}/${
            message.message_id
          }`,
        shortcut
      },
      isUndefined
    ),
    { noColor: true }
  )

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.message.sub(async ({ sendMessageToCurrentChat, ctx, message, currentChat, currentChatId }) => {
    const isPrivate = message.chat.type === 'private'
    if (!config.adminChatIdsCanReceiveReply) return
    const parseResult = tryCatchReturn<ChatInfoParseResult | null>(
      () =>
        yaml.load(message.reply_to_message?.text || '') as ChatInfoParseResult,
      () => null
    )
    if (parseResult && isPrivate) {
      if (config.adminChatIds && !config.adminChatIds.includes(currentChatId)) {
        await sendMessageToCurrentChat('Permission denied.')
        return
      }
      await ctx.telegram.sendCopy(
        parseInt(parseResult.chatId),
        message,
        parseResult
          ? {
              reply_to_message_id: parseResult.messageId
            }
          : {}
      )
      return
    }
    if (config.adminChatIds?.includes(currentChat.id) && isPrivate) return
    if (
      (message.reply_to_message &&
        message.reply_to_message?.from?.username === bot.username) ||
      message.text?.includes(`@${bot.username}`) ||
      isPrivate
    ) {
      const textToCheck = `${message.text || ''} ${message.caption || ''}`
      const matchCount = spamPatterns.reduce((acc, re) => acc + (re.test(textToCheck) ? 1 : 0), 0)
      // 有按钮就认为是垃圾消息
      if (matchCount >= 2 || message.reply_markup?.inline_keyboard) {
        await sendMessageToCurrentChat('`filtered`', {
          parse_mode: 'MarkdownV2'
        })
        return
      }
      const shortcut = config.list.find((el) => el.id === currentChatId)?.name

      for (const el of config.adminChatIds || []) {
        await bot.forwardMessage(el, currentChatId, message.message_id)
        await bot.sendMessage(
          el,
          chatInfoString(currentChat, message, shortcut)
        )
      }
    }
  })
  bot.command.sub(async ({ ctx, commandName, sendMessageToCurrentChat }) => {
    const paramDefinition = {
      replyMessageType:
        '以 yaml 格式储存的，包含 chatId 和 messageId 键的消息。这些信息被使用一次后将会从内存中清除。'
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
      await sendMessageToCurrentChat(
        errorMessages.illegalReplyMessageCount(paramDefinition)
      )
      return
    }
    replyTargetStore.chatId = parseInt(parseResult.chatId)
    replyTargetStore.messageId = parseInt(parseResult.messageId)
    await sendMessageToCurrentChat(
      `成功。\n${formatYaml.render(replyTargetStore, { noColor: true })}`
    )
  })
  bot.command.sub(
    async ({
      ctx,
      commandName,
      args,
      currentChatId,
      sendMessageToCurrentChat
    }) => {
      const paramDefinition: ParamsDefinition = {
        argumentList: [
          {
            name: 'contact',
            acceptable: `发送目标。可以是以下任意字符串或任意 ChatId：${config.list
              .map((el) => el.name)
              .join(
                ', '
              )}；如果不指定此参数，则必须先通过 /sayTarget 指令指定发送目标。`,
            optional: true
          }
        ],
        replyMessageType: '发送内容。'
      }
      if (commandName !== 'say' || !currentChatId) return
      if (config.adminChatIds && !config.adminChatIds.includes(currentChatId)) {
        await sendMessageToCurrentChat('Permission denied.')
        return
      }
      if (
        !isNumeric(args[0]) &&
        !config.list.find((el) => args[0] === el.name) &&
        !replyTargetStore.chatId
      ) {
        await sendMessageToCurrentChat(
          errorMessages.illegalArguments(paramDefinition)
        )
        return
      }
      const predefinedTarget = config.list.find((el) => el.name === args[0])?.id
      if (!ctx.message?.reply_to_message) {
        await sendMessageToCurrentChat(
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
                reply_to_message_id: replyTargetStore.messageId
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
        await sendMessageToCurrentChat(stringify(e))
        console.log(e)
      }
    }
  )
}
