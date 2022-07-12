import { asNonNullable, TelegramBotName } from '../utils/type'

import persistConfig from '../utils/persistConfig'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { fetchGalnet } from '../interface/galnet'
import { HTTPError } from 'got'
import telemetry from '../utils/telemetry'
import { isNull } from 'lodash-es'
import { translateText } from '../interface/translate'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'
import { argsTypeValidation, isNumeric } from '../utils/lang'
import { telegramHTMLEscape } from '../utils/telegram'

const configs = persistConfig.entries.galnet

const store: Partial<
  Record<
    TelegramBotName,
    {
      startFrom: null | string
      recentNewsIds: string[]
    }
  >
> = {}

const historyGalnetNewsCountCommand = 'configure_history_galnet_count'

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, commandName, args }) => {
    const paramsDefinition: ParamsDefinition = {
      argumentList: [
        {
          name: 'historyCount',
          acceptable: '下次推送从前几条开始推送。0 表示不使用历史 tweet。'
        }
      ]
    }
    const chatId = ctx.chat?.id!
    if (commandName !== historyGalnetNewsCountCommand) return
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
    const currentStore = store[botName as TelegramBotName]!
    const historyCount = parseInt(args[0])
    if (!currentStore?.recentNewsIds.length) {
      bot.sendMessage(chatId, 'History not available at this time.').then()
      return
    }
    if (historyCount > currentStore.recentNewsIds.length) {
      bot
        .sendMessage(
          chatId,
          `History count cannot greater than history record count which is ${
            currentStore!.recentNewsIds.length
          }.`
        )
        .then()
      return
    }
    const recentTweets = currentStore.recentNewsIds.concat()
    if (historyCount === 0) {
      currentStore.startFrom = recentTweets[0]
    } else {
      currentStore.startFrom = recentTweets[historyCount]
    }
    await bot.sendMessage(chatId, 'Success.')
  })
}

const worker = async (botName: string) => {
  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]
  const recentGalnetNewsFromServer = await fetchGalnet().catch(
    (err: HTTPError) => {
      console.error(err)
      telemetry(err.message, err.response, err)
    }
  )
  if (
    !recentGalnetNewsFromServer ||
    recentGalnetNewsFromServer.length === 0 ||
    recentGalnetNewsFromServer.some((entries) =>
      Object.values(entries).some((el) => !el)
    )
  ) {
    await telemetry('Galnet 数据异常。', recentGalnetNewsFromServer)
    return
  }
  if (!store[botName as TelegramBotName]) {
    store[botName as TelegramBotName] = {
      startFrom: null,
      recentNewsIds: []
    }
  }
  const currentStore = store[botName as TelegramBotName]!
  currentStore.recentNewsIds = recentGalnetNewsFromServer
    .map((el) => asNonNullable(el.id))
    .concat()

  if (isNull(currentStore.startFrom)) {
    const recentTweets = currentStore.recentNewsIds.concat()
    currentStore.startFrom = recentTweets[0]
    return
  }

  const newsToSend = recentGalnetNewsFromServer
    .filter((el) => el.id! > currentStore.startFrom!)
    .concat()

  if (!newsToSend.length) return

  for (const news of newsToSend) {
    let translateErrorString = ''
    const contentSlice = news.content!.split(/[\r\n]+/)
    const contentTranslated: string[] = []
    const titleTranslated = [
      news.title,
      telegramHTMLEscape(await translateText(news.title!)
        .then((res) => res?.map((el) => el.text).join('\n'))
        .catch((e) => {
          translateErrorString = telegramHTMLEscape(e.message)
          return ''
        }) || '')
    ].join('\n')
    // no need to multi-thread here.
    for (const line of contentSlice) {
      contentTranslated.push(
        [
          line,
          (await translateText(line)
            .then((res) => res?.map((el) => el.text).join('\n'))
            .catch((e) => {
              translateErrorString = e.message
              return ''
            })) || ''
        ].join('\n')
      )
    }
    if (translateErrorString) {
      await telemetry(translateErrorString)
    }
    const params = news
    for (const [i, v] of Object.entries(params)) {
      // @ts-expect-error key type problem
      params[i] = telegramHTMLEscape(v!)
    }
    await bot.runActions(
      config.actions,
      { defaultChatId: 0 },
      {
        ...params,
        titleTranslated,
        contentTranslated: telegramHTMLEscape(contentTranslated.join('\n\n')),
        translateErrorString
      }
    )
  }
  currentStore.startFrom = currentStore.recentNewsIds[0]
}

const main = async (botName: string) => {
  await worker(botName)
  setTimeout(
    () => main(botName),
    configs[botName as TelegramBotName].updateInterval
  )
}

Object.keys(configs).forEach((el) => main(el))
