import { getTweetTimelineById } from '../interface/twitter'
import telemetry from '../utils/telemetry'
import { HTTPError } from 'got'
import { isNull, last } from 'lodash-es'
import { TelegramBotName } from '../utils/type'
import configFile from '../utils/configFile'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { argsTypeValidation, isNumeric } from '../utils/lang'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'

const configs = configFile.entries.master.twitterForwarding

const store: Partial<
  Record<
    TelegramBotName,
    {
      startFrom: null | bigint
      configTipSent: boolean
      recentTweetIds: bigint[]
    }
  >
> = {}

const historyTweetCountCommand = 'configure_history_tweet_count'

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, commandName, args }) => {
    const paramsDefinition: ParamsDefinition = {
      argumentList: [
        {
          name: 'historyCount',
          acceptable: '从前几条开始推送。0 表示不使用历史 tweet。',
        },
      ],
    }
    const chatId = ctx.chat?.id!
    if (commandName !== historyTweetCountCommand) return
    if (!config.allowConfigUser?.length) {
      bot.sendMessage(chatId, 'No allow user configured.').then()
      return
    }
    if (!config.allowConfigUser.includes(chatId)) {
      bot.sendMessage(chatId, 'Permission denied.').then()
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
    if (!isNull(store[botName as TelegramBotName]?.startFrom)) {
      bot.sendMessage(chatId, `${botName} has been configured.`).then()
      return
    }
    const currentBotConfig = store[botName as TelegramBotName]!
    const historyCount = parseInt(args[0])
    if (historyCount > 5) {
      bot.sendMessage(chatId, `History count cannot greater that 5.`).then()
      return
    }
    if (currentBotConfig.recentTweetIds.length === 0) {
      bot.sendMessage(chatId, `History not available at this time.`).then()
      return
    }
    if (historyCount > currentBotConfig.recentTweetIds.length) {
      bot
        .sendMessage(
          chatId,
          `History count cannot greater than history record count which is ${
            currentBotConfig!.recentTweetIds.length
          }.`
        )
        .then()
      return
    }
    const recentTweets = currentBotConfig.recentTweetIds.concat().reverse()
    if (historyCount === 0) {
      currentBotConfig.startFrom = recentTweets[0] + BigInt(1)
    } else {
      currentBotConfig.startFrom = recentTweets[historyCount - 1]
    }
    await bot.sendMessage(chatId, '成功。')
  })
}

const worker = async (botName: string) => {
  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]
  const recentTweets = await getTweetTimelineById(config.watch, {
    ...config.options,
  }).catch((err: HTTPError) => {
    console.error(err)
    telemetry(err.message, err.response, err)
  })
  if (!recentTweets?.data) return
  if (!store[botName as TelegramBotName]) {
    store[botName as TelegramBotName] = {
      startFrom: null,
      configTipSent: false,
      recentTweetIds: [],
    }
  }
  const currentStore = store[botName as TelegramBotName]!
  currentStore.recentTweetIds = recentTweets.data
    .map((el) => BigInt(el.id))
    .concat()
    .reverse()

  if (isNull(currentStore.startFrom)) {
    if (currentStore.configTipSent) return
    config.allowConfigUser?.forEach((id) =>
      bot.sendMessage(
        id,
        `${config.watch} 的 tweet 已经完成 bot 重新启动后的第一次成功获取，需要指定追溯多少条历史 tweet。\n` +
          `可以使用指令 /${historyTweetCountCommand} 来完成该配置，详情请运行该命令查看帮助。\n` +
          `下面是最近的 tweet 列表（倒序排列）：\n` +
          recentTweets
            .data!.map((el, key) => `${key + 1}: ${el.text}`)
            .join('\n')
      )
    )
    currentStore.configTipSent = true
    return
  }
  const tweetsToSend = recentTweets.data
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
          filterMethod: (text, filterText) => !!text.match(filterText),
        },
        {
          ...tweet,
          sourceUrlIfNoUrlInTweetContent,
          sourceUrlWithLineBreakIfNoUrlInTweetContent:
            '\n' + sourceUrlIfNoUrlInTweetContent,
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
