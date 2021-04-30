import { Telegraf } from 'telegraf'
import { TelegrafContext } from 'telegraf/typings/context'
import TypedEvent from '../utils/TypedEvent'
import * as tt from 'telegraf/typings/telegram-types'
import promiseRetry from 'promise-retry'
import { Message } from 'telegram-typings'
import persistConfig from '../utils/persistConfig'

type BotName = 'misaka' | 'ywwuyi' | 'strawberry960'

const botList: Array<{ name: BotName; token: string }> = persistConfig.data['config.json'].bots as any

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
    meta: { isCommand: boolean, chatId: number }
  }>(),
  command: TypedEvent<{
    ctx: TelegrafContext
    meta: { commandName: string; args: string[], chatId: number }
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
      (message.chat.type === 'private' && message.text?.match(/^\/(\w+).*$/)) ||
      message.text?.match(
        new RegExp(`^\\/(\\w+).*@${el.instance.options.username}$`)
      )

    if (commandMatchArray) {
      eventBus.command.dispatch({
        ctx,
        meta: {
          commandName: commandMatchArray[1],
          chatId: message.chat.id,
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
        chatId: message.chat.id,
        isCommand: !!commandMatchArray,
      },
    })
  })

  return {
    ...eventBus,
    bot: el.instance,
    sendMessage: (chatId: number, text: string, extra?: tt.ExtraEditMessage) =>
      promiseRetry((retry) =>
        el.instance.telegram.sendMessage(chatId, text, extra).catch(retry)
      ),
  }
}

export type BotType = ReturnType<typeof botFactory>

export const exportBot = {} as Record<BotName, BotType>

bots.forEach((el) => {
  exportBot[el.name] = botFactory(el)
})

export default exportBot
