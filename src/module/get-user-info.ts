import configFile from '../utils/configFile'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import * as tt from 'telegraf/typings/telegram-types'
import errorMessages from '../utils/errorMessages'

const chatIdInfo = (chat: tt.Chat) =>
  [
    `Hi ${chat.first_name || chat.title} ${chat.last_name || ''}`,
    `chatId: ${chat.id}`,
    ...(chat.username ? [`userName: ${chat.username}`] : []),
    `chatType: ${chat.type}`,
  ].join('\n')

const paramDefinition = {
  argumentList: [
    {
      name: 'chatId?',
      acceptable: '可选的 chatId。如不指定，则查询当前 chat。',
    },
  ],
}

for (const [botName, _] of Object.entries(
  configFile.entries.master.getUserInfo
)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, meta }) => {
    if (meta.commandName !== 'get_user_info' || !ctx.chat) return
    const reply = ctx.message?.reply_to_message
    // no white space
    if (reply?.text?.match(/^((?!\s).)*$/)) {
      bot.sendMessage(ctx.chat.id, '正在查询').then()
      try {
        const chatInfo = await bot.bot.telegram.getChat(parseInt(reply?.text))
        await bot.sendMessage(ctx.chat.id, chatIdInfo(chatInfo))
      } catch (e) {
        if (e.description === 'Bad Request: chat not found') {
          await bot.sendMessage(
            ctx.chat?.id!,
            '会话不存在。请注意，如果我没有加入目标群或者没有和目标用户对话过，则无法查询到信息。'
          )
        } else {
          await bot.sendMessage(ctx.chat?.id!, JSON.stringify(e))
        }
      }
    } else if (!reply) {
      await bot.sendMessage(ctx.chat.id, chatIdInfo(ctx.chat)).then()
    } else {
      await bot.sendMessage(
        ctx.chat.id,
        errorMessages.illegalReplyMessage(paramDefinition)
      )
    }
  })
}
