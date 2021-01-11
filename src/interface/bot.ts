import { Telegraf } from 'telegraf'
import { TelegrafContext } from 'telegraf/typings/context'
import TypedEvent from '../utils/TypedEvent'
import * as tt from 'telegraf/typings/telegram-types'

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('Env [TELEGRAM_BOT_TOKEN] was not set. Exiting.')
}

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

// username enables receiving group message. https://github.com/telegraf/telegraf/issues/134
// note: you will need to kick bot then invite it again to receive group message.
// https://github.com/yagop/node-telegram-bot-api/issues/174
bot.telegram.getMe().then((botInfo) => {
  console.log(`Connected as ${botInfo.username}`)
  bot.options.username = botInfo.username
})

bot.startPolling(30, 100)
console.log('server started')
export const eventBus = {
  message: TypedEvent<{
    ctx: TelegrafContext
    message: NonNullable<tt.Update['message']>
    currentChat: tt.Chat
    meta: { isCommand: boolean }
  }>(),
  command: TypedEvent<{
    ctx: TelegrafContext
    meta: { commandName: string }
  }>(),
}

bot.on('message', (ctx) => {
  const currentChat = ctx.update.message?.chat
  const message = ctx.update.message
  if (!currentChat || !message) {
    return
  }
  const commandMatchArray =
    (message.chat.type === 'private' && message.text?.match(/^\/(\w+)\s*$/)) ||
    message.text?.match(new RegExp(`^\\/(\\w+)\\s*@${bot.options.username}$`))

  if (commandMatchArray) {
    eventBus.command.dispatch({
      ctx,
      meta: { commandName: commandMatchArray[1] },
    })
  }
  eventBus.message.dispatch({
    ctx,
    message,
    currentChat,
    meta: {
      isCommand: !!commandMatchArray,
    },
  })
})
