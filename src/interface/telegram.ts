import { Telegraf } from 'telegraf'
import { TelegrafContext } from 'telegraf/typings/context'
import TypedEvent from '../utils/TypedEvent'
import * as tt from 'telegraf/typings/telegram-types'
import promiseRetry from 'promise-retry'
import { Message } from 'telegram-typings'
import persistConfig, { Actions } from '../utils/configFile'
import { sleep } from '../utils/lang'
import telemetry from '../utils/telemetry'
import { TelegramBotName } from '../utils/type'
import HttpsProxyAgent from 'https-proxy-agent'

const botList: Array<{ name: TelegramBotName; token: string }> = persistConfig
  .entries.master.tokenTelegram as any

// @ts-ignore
const agent = persistConfig.entries.master.proxy ? new HttpsProxyAgent(persistConfig.entries.master.proxy) : undefined

const bots = botList.map((el) => ({
  ...el,
  instance: new Telegraf(el.token, {
    telegram: {
      agent
    }
  }),
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
    meta: { isCommand: boolean; chatId: number }
  }>(),
  command: TypedEvent<{
    ctx: TelegrafContext
    meta: { commandName: string; args: string[]; chatId: number }
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

  const sendMessage = (
    chatId: number,
    text: string,
    extra?: tt.ExtraEditMessage
  ) =>
    promiseRetry((retry) =>
      el.instance.telegram.sendMessage(chatId, text, extra).catch(retry)
    )

  return {
    ...eventBus,
    bot: el.instance,
    sendMessage,
    self: {
      username: el.instance.options.username!
    },
    runActions: (
      actions: Actions,
      options: { defaultChatId: number },
      params: Record<string, string | number | undefined> = {}
    ) => {
      // convert actions to promises
      const promises = actions.map((action) => async () => {
        // group of action.
        for (const step of action) {
          const chatId = step.dest || options.defaultChatId
          if (!chatId)
            await telemetry(
              `AssertionError: ChatId was not defined with step ${JSON.stringify(
                step
              )}`
            )
          else if (step.type === 'message')
            await sendMessage(
              chatId,
              step.text.replaceAll(/\${(.*?)}/g, (_, name) =>
                params[name]?.toString() || `<${name}=nil>`
              )
            )
          else if (step.type === 'sleep') await sleep(step.time)
          else if (step.type === 'messageByForward')
            await promiseRetry((retry) =>
              el.instance.telegram
                .forwardMessage(
                  chatId,
                  step.source,
                  step.messageId
                )
                .catch(retry)
            )
          else {
            const errorMsg = `AssertionError: type ${
              // @ts-ignore
              step.type
            } was not defined with step ${JSON.stringify(step)}`
            await sendMessage(chatId, errorMsg)
          }
        }
      })
      // await all actions done
      return Promise.all(promises.map(el => el())).then()
    }
  }
}

export type BotType = ReturnType<typeof botFactory>

export const exportBot = {} as Record<TelegramBotName, BotType>

bots.forEach((el) => {
  exportBot[el.name] = botFactory(el)
})

export default exportBot
