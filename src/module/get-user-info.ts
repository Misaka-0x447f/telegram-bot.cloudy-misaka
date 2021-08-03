import configFile from "../utils/configFile";
import telegram from "../interface/telegram";
import { TelegramBotName } from "../utils/type";
import * as tt from "telegraf/typings/telegram-types";
import errorMessages from "../utils/errorMessages";
import { isNumeric } from "../utils/lang";

const chatIdInfo = (chat: tt.Chat) =>
  [
    `Hi ${chat.first_name || chat.title} ${
      chat.last_name || ''
    }`,
    `chatId: ${chat.id}`,
    ...(chat.username ? [`userName: ${chat.username}`] : []),
    `chatType: ${chat.type}`,
  ].join('\n')

for (const [botName, _] of Object.entries(configFile.entries.master.getUserInfo)) {
  const bot = telegram[botName as TelegramBotName]
  bot.command.sub(async ({ ctx, meta }) => {
    if (meta.commandName !== 'get_user_info' || !ctx.chat) return
    const reply = ctx.message?.reply_to_message
    if (reply?.text && isNumeric(reply?.text)) {
      bot.sendMessage(ctx.chat.id, '正在查询').then()
      try {
        const chatInfo = await bot.bot.telegram.getChat(parseInt(reply?.text))
        await bot.sendMessage(ctx.chat.id, chatIdInfo(chatInfo))
      } catch (e) {
        await bot.sendMessage(ctx.chat?.id!, JSON.stringify(e))
      }
    } else if (!reply) {
      await bot.sendMessage(ctx.chat.id,
        chatIdInfo(ctx.chat)
      ).then()
    } else {
      await bot.sendMessage(ctx.chat.id, errorMessages.unexpectedArguments([
        {
          name: 'chatId?',
          acceptable: '可选的 chatId。必须是整数。如不指定，则查询当前 chat。'
        }
      ]))
    }
  })
}
