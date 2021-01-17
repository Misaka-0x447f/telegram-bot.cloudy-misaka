import { Telegraf } from 'telegraf'
import { TelegrafContext } from 'telegraf/typings/context'
import TypedEvent from '../utils/TypedEvent'
import * as tt from 'telegraf/typings/telegram-types'
import promiseRetry from 'promise-retry'
import { Message } from 'telegram-typings'

type BotName = 'misaka' | 'ywwuyi'

const botList: Array<{ name: BotName; token: string }> = [
  { name: 'misaka', token: 'TELEGRAM_BOT_TOKEN' },
  { name: 'ywwuyi', token: 'TELEGRAM_BOT_TOKEN_YWWUYI' },
]

let hasError = false
for (const bot of botList) {
  if (!process.env[bot.token]) {
    hasError = true
    console.error(`Env [${bot.token}] was not set. Exiting.`)
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
    message: NonNullable<Message>
    currentChat: tt.Chat
    meta: { isCommand: boolean }
  }>(),
  command: TypedEvent<{
    ctx: TelegrafContext
    meta: { commandName: string; args: string[] }
  }>(),
})

const botFactory = (el: typeof bots[0]) => {
  const eventBus = eventBusFactory()

  el.instance.on('message', (ctx) => {
    const currentChat = ctx.update.message?.chat
    const message = ctx.update.message
    if (!currentChat || !message) {
      return
    }
    const commandMatchArray =
        (message.chat.type === 'private' &&
            message.text?.match(/^\/(\w+).*$/)) ||
        message.text?.match(
            new RegExp(`^\\/(\\w+).*@${el.instance.options.username}$`)
        )

    if (commandMatchArray) {
      eventBus.command.dispatch({
        ctx,
        meta: {
          commandName: commandMatchArray[1],
          args: message
              .text!.match(/\/\w+(?:\s?@\w+)?(.*)/)![1]
              .trim()
              .split(' '),
        },
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

  return {
    ...eventBus,
    bot: el.instance,
    sendMessage: (chatId: number, text: string) =>
        promiseRetry((retry) =>
            el.instance.telegram.sendMessage(chatId, text).catch(retry)
        ),
  }
}

export type BotType = ReturnType<typeof botFactory>

export const exportBot = {} as Record<BotName, BotType>

bots.forEach((el) => {
  exportBot[el.name] = botFactory(el)
})

export default exportBot
