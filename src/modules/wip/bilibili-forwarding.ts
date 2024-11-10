import { getFeedByHandle } from '../../interface/bluesky'
import telemetry from '../../utils/telemetry'
import { HTTPError } from 'got'
import { isNull, last } from 'lodash-es'
import { TelegramBotName } from '../../utils/type'
import persistConfig from '../../utils/persistConfig'
import { getTelegramBotByAnyBotName } from '../../interface/telegram'
import { argsTypeValidation, isNumeric } from '../../utils/lang'
import errorMessages, { ParamsDefinition } from '../../utils/errorMessages'

const configs = persistConfig.entries.biliForwarding

const store: Partial<
  Record<
    TelegramBotName,
    {
      startFrom: null | bigint
      recentTweetIds: bigint[]
    }
  >
> = {}

const historyPostCountCommand = 'bili_configure_history_post_count'

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, commandName, args }) => {
    const paramsDefinition: ParamsDefinition = {
      argumentList: [
        {
          name: 'historyCount',
          acceptable: '下次推送从前几条开始推送。0 表示不使用历史 post。'
        }
      ]
    }
    const chatId = ctx.chat?.id!
    if (commandName !== historyPostCountCommand) return
    if (!config.superusers?.length) {
      bot.sendMessage(chatId, 'No superuser configured.').then()
      return
    }
    if (!config.superusers.includes(chatId)) {
      bot.sendMessage(chatId, 'You are not in the sudoers file. This incident will be reported.').then()
      return
    }
    if (args.length !== 1) {
      bot
        .sendMessage(
          chatId,
          errorMessages.illegalArgumentCount(1, args.length, paramsDefinition)
        )
        .then()
      return
    }
    if (!argsTypeValidation(args, [isNumeric])) {
      bot
        .sendMessage(chatId, errorMessages.illegalArguments(paramsDefinition))
        .then()
      return
    }
    const currentStore = store[botName as TelegramBotName]!
    const historyCount = parseInt(args[0])
    if (currentStore.recentPostTime.length === 0) {
      bot.sendMessage(chatId, 'History not available at this time.').then()
      return
    }
    if (historyCount > currentStore.recentPostTime.length) {
      bot
        .sendMessage(
          chatId,
          `History count cannot greater than history record count which is ${
            currentStore!.recentPostTime.length
          }.`
        )
        .then()
      return
    }
    const recentTweets = currentStore.recentPostTime.concat().reverse()
    if (historyCount === 0) {
      currentStore.startFrom = recentTweets[0] + BigInt(1)
    } else {
      currentStore.startFrom = recentTweets[historyCount - 1]
    }
    await bot.sendMessage(chatId, historyCount === 0 ? 'Success.' : `Success. Next time will be start from: https://twitter.com/${config.watch}/status/${currentStore.startFrom}`)
  })
}

const worker = async (botName: string) => {
  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]
  const recentTweetsFromServer = await getFeedByHandle(config, {
    ...config.options
  }).catch((err: HTTPError) => {
    console.error(err)
    telemetry(err.message, err.response, err)
  })
  if (!recentTweetsFromServer?.data) return
  if (!store[botName as TelegramBotName]) {
    store[botName as TelegramBotName] = {
      startFrom: null,
      recentPostTime: []
    }
  }
  const currentStore = store[botName as TelegramBotName]!
  currentStore.recentPostTime = recentTweetsFromServer.data
    .map((el) => BigInt(el.id))
    .concat()
    .reverse()

  if (isNull(currentStore.startFrom)) {
    const recentTweets = currentStore.recentPostTime.concat().reverse()
    currentStore.startFrom = recentTweets[0] + BigInt(1)
    return
  }
  const tweetsToSend = recentTweetsFromServer.data
    .filter((el) => BigInt(el.id) >= currentStore.startFrom!)
    .concat()
    .reverse()
  if (!tweetsToSend.length) return
  for (const tweet of tweetsToSend) {
    const sourceUrlIfNoUrlInTweetContent = tweet.text.match(
      /https:\/\/t\.co\/\w+/
    )
      ? ''
      : `https://twitter.com/${config.watch}/status/${tweet.id}`
    await bot
      .runActions(
        config.actions,
        {
          defaultChatId: 0,
          filterMethod: (text, filterText) => !!text.match(filterText)
        },
        {
          ...tweet,
          sourceUrlIfNoUrlInTweetContent,
          sourceUrlWithLineBreakIfNoUrlInTweetContent:
            '\n' + sourceUrlIfNoUrlInTweetContent
        }
      )
      .then()
  }
  currentStore.startFrom = BigInt(last(tweetsToSend)!.id) + BigInt(1)
}
const main = async (botName: string) => {
  await worker(botName)
  setTimeout(
    () => main(botName),
    configs[botName as TelegramBotName].updateInterval
  )
}

Object.keys(configs).forEach((el) => main(el))
