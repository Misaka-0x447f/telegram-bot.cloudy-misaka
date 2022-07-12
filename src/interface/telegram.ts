import { Telegraf, Telegram } from 'telegraf'
import { TelegrafContext } from 'telegraf/typings/context'
import TypedEvent from '../utils/TypedEvent'
import * as tt from 'telegraf/typings/telegram-types'
import promiseRetry from 'promise-retry'
import { Message } from 'telegram-typings'
import persistConfig, { Actions, RegexString } from '../utils/persistConfig'
import { sleep } from '../utils/lang'
import telemetry from '../utils/telemetry'
import { TelegramBotName, TupleOmitFirst } from '../utils/type'
import HttpsProxyAgent from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'

import { runActionFunctions } from '../utils/actionFunctions'
import telegrafThrottler from 'telegraf-throttler'
import { defaultTo } from 'lodash-es'

const botList: Array<{ name: TelegramBotName; token: string }> = persistConfig
  .entries.tokenTelegram as any

const agent = process.env.HTTP_PROXY // @ts-ignore
  ? new HttpsProxyAgent(process.env.HTTP_PROXY)
  : process.env.SOCKS_PROXY ? new SocksProxyAgent(process.env.SOCKS_PROXY) : undefined

const bots = botList.map((el) => ({
  ...el,
  instance: new Telegraf(el.token, {
    telegram: {
      agent
    }
  })
}))

const botUsernameTable: Partial<Record<TelegramBotName, string>> = {}
const throttler = telegrafThrottler()

// username enables receiving group message. https://github.com/telegraf/telegraf/issues/134
// note: you will need to kick bot then invite it again to receive group message.
// https://github.com/yagop/node-telegram-bot-api/issues/174
bots.forEach((bot) => {
  bot.instance.use(throttler)
  bot.instance.telegram.getMe().then((botInfo) => {
    console.log(`Connected to ${botInfo.username}`)
    bot.instance.options.username = botInfo.username
    botUsernameTable[bot.name] = botInfo.username!
  })

  bot.instance.startPolling(30, 100)
})

interface CommonProperties {
  ctx: TelegrafContext
  message: NonNullable<Message>
  currentChat: tt.Chat
  currentChatId: number
  sendMessageToCurrentChat: (
    ..._: TupleOmitFirst<Parameters<Telegram['sendMessage']>>
  ) => ReturnType<Telegram['sendMessage']>
}

const eventBusFactory = () => ({
  message: TypedEvent<
    {
      isCommand: boolean
    } & CommonProperties
  >(),
  command: TypedEvent<
    {
      commandName: string
      args: string[]
    } & CommonProperties
  >()
})

const botFactory = (el: typeof bots[0]) => {
  const eventBus = eventBusFactory()

  function retryableMethodFactory<T extends (..._: any[]) => any>(method: T) {
    // @ts-ignore
    return (...params: Parameters<T>) =>
      promiseRetry((retry) => method(...params).catch(retry), { retries: 3, factor: 5 }) as ReturnType<T>
  }

  // fxxk 'this'.
  const sendMessage = retryableMethodFactory(
    el.instance.telegram.sendMessage.bind(el.instance.telegram)
  )

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

    const commonProperties = {
      ctx,
      message,
      sendMessageToCurrentChat: (
        ...params: TupleOmitFirst<Parameters<Telegram['sendMessage']>>
      ) => sendMessage(message.chat.id, ...params),
      currentChat,
      currentChatId: message.chat.id
    }

    if (commandMatchArray) {
      eventBus.command.dispatch({
        ...commonProperties,
        commandName: commandMatchArray[1],
        args: message
          .text!.match(/\/\w+(?:\s?@\w+)? ?(.*)/)![1]
          .trim()
          .split(' ')
      })
    }
    eventBus.message.dispatch({
      ...commonProperties,
      isCommand: !!commandMatchArray
    })
  })

  return {
    ...eventBus,
    instance: el.instance,
    alias: el.name,
    get username () {
      return botUsernameTable[el.name]!
    },
    sendMessage,
    forwardMessage: retryableMethodFactory(
      el.instance.telegram.forwardMessage.bind(el.instance.telegram)
    ),
    runActions: (
      actions: Actions,
      options: {
        defaultChatId: number
        // eslint-disable-next-line no-unused-vars
        filterMethod?: (text: string, filterText: RegexString) => boolean
      },
      params: Record<string, string | number | undefined> = {}
    ) => {
      // convert actions to promises
      const promises = actions.map((action) => async () => {
        // group of action.
        for (const step of action) {
          const chatId = step.dest || options.defaultChatId
          if (!chatId) {
            await telemetry(
              `AssertionError: ChatId was not defined with step ${JSON.stringify(
                step
              )}`
            )
          } else if (step.type === 'message') {
            const text = runActionFunctions(step.text).replaceAll(
              /\${(.*?)}/g,
              (_, name) => defaultTo(params[name]?.toString(), `<${name}=nil>`)
            )
            if (
              options.filterMethod &&
              step.filter &&
              !options.filterMethod(text, step.filter)
            ) return
            await sendMessage(chatId, text, step?.extra)
          } else if (step.type === 'sleep') await sleep(step.time)
          else if (step.type === 'messageByForward') {
            await promiseRetry((retry) =>
              el.instance.telegram
                .forwardMessage(chatId, step.source, step.messageId)
                .catch(retry)
            )
          } else {
            const errorMsg = `AssertionError: type ${
              // @ts-ignore
              step.type
            } was not defined with step ${JSON.stringify(step)}`
            await sendMessage(chatId, errorMsg)
          }
        }
      })
      // await all actions done
      return Promise.all(promises.map((el) => el())).then()
    }
  }
}

export type BotType = ReturnType<typeof botFactory>

export const exportBot = {} as Record<TelegramBotName, BotType>

bots.forEach((el) => {
  exportBot[el.name] = botFactory(el)
})

export const getTelegramBotByAnyBotName = (botName: string) => {
  if (!exportBot[botName as TelegramBotName]) {
    const message = `Assertion error: Bot name ${botName} does not exist, but mentioned by config file or something else. ${
      new Error().stack
    }`
    telemetry(message).then()
    throw new Error(message)
  }
  return exportBot[botName as TelegramBotName]
}

export default exportBot
