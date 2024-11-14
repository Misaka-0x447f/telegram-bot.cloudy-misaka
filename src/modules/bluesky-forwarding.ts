import telemetry from '../utils/telemetry'
import { isNull, last } from 'lodash-es'
import { TelegramBotName } from "../utils/type";
import persistConfig from '../utils/persistConfig'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { argsTypeValidation, isNumeric } from '../utils/lang'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'
import { BlueskyPost, getFeedByHandle } from "../interface/bluesky";

const configs = persistConfig.entries.bluesky

const store: Partial<
  Record<
    TelegramBotName,
    {
      startFrom: null | number
      recentPosts: BlueskyPost[]
    }
  >
> = {}

const historyPostCountCommand = 'configure_history_bluesky_post_count'

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
    const currentStore = store[botName as TelegramBotName]
    if (!currentStore) {
      void bot.sendMessage(chatId, '你来的真早！store 尚未被初始化。')
      return
    }
    const historyCount = parseInt(args[0])
    if (currentStore.recentPosts.length === 0) {
      void bot.sendMessage(chatId, 'History not available at this time.')
      return
    }
    if (historyCount > currentStore.recentPosts.length) {
      bot
        .sendMessage(
          chatId,
          `History count cannot greater than history record length which is ${
            currentStore!.recentPosts.length
          }.`
        )
        .then()
      return
    }
    const recentPosts = currentStore.recentPosts.concat()
    if (historyCount === 0) {
      currentStore.startFrom = recentPosts[0].unixTimeStamp + 1
    } else {
      currentStore.startFrom = recentPosts[historyCount - 1].unixTimeStamp
    }
    await bot.sendMessage(chatId, historyCount === 0 ? 'Success.' : `Success. Next time we will be start from: ${recentPosts[historyCount - 1].url}`)
  })
}

const worker = async (botName: string) => {
  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]
  const recentPostFromServer = await getFeedByHandle(config.watch, {
    limit: 5,
    excludeReplies: true
  })
  if (!recentPostFromServer?.data) {
    void telemetry(
      `bluesky-forwarding.ts/worker`,
      `bluesky request returned with no data: ${botName}`)
    return
  }
  if (!store[botName as TelegramBotName]) {
    store[botName as TelegramBotName] = {
      startFrom: null,
      recentPosts: []
    }
  }
  const currentStore = store[botName as TelegramBotName]!
  currentStore.recentPosts = recentPostFromServer.data
    .concat()

  if (isNull(currentStore.startFrom)) {
    const recentTweets = currentStore.recentPosts.concat()
    currentStore.startFrom = recentTweets[0].unixTimeStamp + 1
    return
  }
  const postsToSend = recentPostFromServer.data
    .filter((el) => el.unixTimeStamp >= currentStore.startFrom!)
    .concat()
  if (!postsToSend.length) return
  for (const post of postsToSend) {
    await bot
      .runActions(
        config.newPostActions,
        {
          defaultChatId: config.dest!,
          filterMethod: (text, filterText) => !!text.match(filterText)
        },
        {
          content: post.text,
          url: post.url
        }
      )
      .then()
  }
  currentStore.startFrom = (last(postsToSend)!.unixTimeStamp) + 1
}
const main = async (botName: string) => {
  await worker(botName).catch((...args) => telemetry(`bluesky-forwarding.ts/worker`, ...args))
  setTimeout(
    () => main(botName),
    configs[botName as TelegramBotName].updateInterval
  )
}

Object.keys(configs).forEach((el) => main(el))
