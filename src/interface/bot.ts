import { Telegraf } from 'telegraf'
import { TelegrafContext } from 'telegraf/typings/context'
import TypedEvent from '../utils/TypedEvent'
import * as tt from 'telegraf/typings/telegram-types'

type BotName = 'misaka' | 'ywwuyi'

const botList: Array<{ name: BotName; token: string }> = [
  { name: 'misaka', token: 'TELEGRAM_BOT_TOKEN' },
  { name: 'ywwuyi', token: 'TELEGRAM_BOT_TOKEN_YWWUYI' },
]

let hasError = false
for (const bot of botList) {
  if (!process.env[bot.token]) {
    hasError = true
    console.error(
      `Env [${bot.token}] was not set. Exiting.`
    )
  }
}
if (hasError) process.exit(1)

const bots = botList.map((el) => ({
  ...el,
  instance: new Telegraf(process.env[el.token]!),
}))

// username enables receiving group message. https://github.com/telegraf/telegraf/issues/134
// note: you will need to kick bot then invite it again to receive group message.
// https://github.com/yagop/node-telegram-bot-api/issues/174
bots.forEach((bot) => {
  bot.instance.telegram.getMe().then((botInfo) => {
    console.log(`Connected to ${botInfo.username}`)
    bot.instance.options.username = botInfo.username
  })

  bot.instance.startPolling(30, 100)
})

const eventBusFactory = () => ({
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
})

export const exportBot = {} as Record<
  BotName,
  ReturnType<typeof eventBusFactory> & { bot: Telegraf<TelegrafContext> }
>

bots.forEach((el) => {
  const eventBus = eventBusFactory()

  el.instance.on('message', (ctx) => {
    const currentChat = ctx.update.message?.chat
    const message = ctx.update.message
    if (!currentChat || !message) {
      return
    }
    const commandMatchArray =
      (message.chat.type === 'private' &&
        message.text?.match(/^\/(\w+)\s*$/)) ||
      message.text?.match(
        new RegExp(`^\\/(\\w+)\\s*@${el.instance.options.username}$`)
      )

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

  exportBot[el.name] = { ...eventBus, bot: el.instance }
})

export default exportBot
