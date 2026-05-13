import { asNonNullable, TelegramBotName } from '../utils/type'

import persistConfig, { Actions } from '../utils/persistConfig'
import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { fetchGalnet } from '../interface/galnet'
import { HTTPError } from 'got'
import telemetry from '../utils/telemetry'
import { isNull, isString } from 'lodash-es'
import { translateGalnetArticle } from '../interface/translate'
import errorMessages, { ParamsDefinition } from '../utils/errorMessages'
import { argsTypeValidation, isNumeric, sleep } from '../utils/lang'
import { splitGalnetContent } from '../utils/galnetContent'
import { telegramHTMLEscape } from '../utils/telegram'

const configs = persistConfig.entries.galnet

const store: Partial<
  Record<
    TelegramBotName,
    {
      startFrom: null | number
      recentNewsIds: number[]
    }
  >
> = {}

const historyGalnetNewsCountCommand = 'configure_history_galnet_count'
const translateRetrySchedule = [2000, 4000, 8000, 16000, 32000, 60000]

type GalnetTranslation = Awaited<ReturnType<typeof translateGalnetArticle>>

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const getErrorStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') {
    return
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number') {
    return statusCode
  }

  return getErrorStatusCode((error as { cause?: unknown }).cause)
}

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return
  }

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string') {
    return code
  }

  return getErrorCode((error as { cause?: unknown }).cause)
}

const getErrorName = (error: unknown): string => {
  if (error instanceof Error && error.name) {
    return error.name
  }

  if (error && typeof error === 'object') {
    const constructorName = (error as { constructor?: { name?: unknown } }).constructor?.name
    if (typeof constructorName === 'string' && constructorName) {
      return constructorName
    }
  }

  return 'UnknownError'
}

const isRetriableTranslateError = (error: unknown) => {
  const statusCode = getErrorStatusCode(error)
  if (typeof statusCode === 'number') {
    return statusCode >= 500
  }

  const code = getErrorCode(error)
  if (typeof code === 'string' && [
    'ECONNABORTED',
    'ECONNREFUSED',
    'ECONNRESET',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET'
  ].includes(code)) {
    return true
  }

  const message = getErrorMessage(error).toLowerCase()
  return [
    'connect timeout',
    'fetch failed',
    'internal server error',
    'network',
    'socket',
    'timed out',
    'timeout'
  ].some((keyword) => message.includes(keyword))
}

const translateGalnetArticleWithRetry = async (
  title: string,
  paragraphs: string[]
) => {
  const retryScheduleUsed: number[] = []
  let finalError: unknown

  for (let attemptIndex = 0; attemptIndex <= translateRetrySchedule.length; attemptIndex++) {
    try {
      const translatedNews = await translateGalnetArticle(title, paragraphs)
      return {
        attempts: attemptIndex + 1,
        finalError: undefined,
        retryScheduleUsed,
        translatedNews
      } as {
        attempts: number
        finalError?: unknown
        retryScheduleUsed: number[]
        translatedNews: GalnetTranslation
      }
    } catch (error) {
      finalError = error
      if (!isRetriableTranslateError(error) || attemptIndex === translateRetrySchedule.length) {
        break
      }

      const delay = translateRetrySchedule[attemptIndex]
      retryScheduleUsed.push(delay)
      await sleep(delay)
    }
  }

  return {
    attempts: retryScheduleUsed.length + 1,
    finalError,
    retryScheduleUsed,
    translatedNews: null
  } as {
    attempts: number
    finalError?: unknown
    retryScheduleUsed: number[]
    translatedNews: null
  }
}

const getActionDestinations = (actions: Actions) => {
  const chatIds = new Set<number>()

  for (const action of actions) {
    for (const step of action) {
      if (!step.dest) {
        continue
      }

      if (step.type === 'message' || step.type === 'messageByForward') {
        chatIds.add(step.dest)
      }
    }
  }

  return Array.from(chatIds)
}

const buildTranslationDiagnostic = (
  model: string,
  attempts: number,
  retryScheduleUsed: number[],
  articleUrl: string,
  error: unknown
) => {
  const statusCode = getErrorStatusCode(error)
  const lines = [
    '[galnet] translation fallback',
    `model=${model}`,
    `attemptCount=${attempts}`,
    `retryScheduleUsed=${retryScheduleUsed.length ? retryScheduleUsed.map((delay) => `${delay / 1000}s`).join(', ') : 'none'}`,
    `errorMessage=${getErrorMessage(error)}`,
    `errorType=${getErrorName(error)}${typeof statusCode === 'number' ? ` statusCode=${statusCode}` : ''}`,
    `articleUrl=${articleUrl}`
  ]

  return lines.join('\n')
}

const sendTranslationDiagnostic = async (
  botName: string,
  actions: Actions,
  diagnosticText: string
) => {
  const bot = getTelegramBotByAnyBotName(botName)
  const chatIds = getActionDestinations(actions)

  if (!chatIds.length) {
    await telemetry(
      'modules/galnet.ts/sendTranslationDiagnostic',
      `No galnet chat destination found for bot ${botName}. Diagnostic text: ${diagnosticText}`
    )
    return
  }

  await Promise.all(chatIds.map((chatId) => bot.sendMessage(chatId, diagnosticText)))
}

for (const [botName, config] of Object.entries(configs)) {
  const bot = getTelegramBotByAnyBotName(botName)
  bot.command.sub(async ({ ctx, commandName, args }) => {
    const paramsDefinition: ParamsDefinition = {
      argumentList: [
        {
          name: 'historyCount',
          acceptable: '下次推送从前几条开始推送。0 表示不使用历史新闻。'
        }
      ]
    }
    if (commandName !== historyGalnetNewsCountCommand) return
    const chatId = ctx.chat?.id
    if (!chatId) return
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
      telemetry(
        `modules/galnet.ts/worker`,
        err.message, err.response, err)
    }
  )
  if (
    !recentGalnetNewsFromServer ||
    recentGalnetNewsFromServer.length === 0 ||
    recentGalnetNewsFromServer.some((entries) =>
      Object.values(entries).some((el) => !el)
    )
  ) {
    await telemetry(
      `modules/galnet.ts/worker`,
      'Galnet 数据异常。', recentGalnetNewsFromServer)
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
    .map((el) => asNonNullable(el.timestamp))
    .concat()

  if (isNull(currentStore.startFrom)) {
    const recentTweets = currentStore.recentNewsIds.concat()
    currentStore.startFrom = recentTweets[0]
    return
  }

  const newsToSend = recentGalnetNewsFromServer
    .filter((el) => el.timestamp! > currentStore.startFrom!)
    .reverse()

  if (!newsToSend.length) return

  for (const news of newsToSend) {
    let translateErrorString = ''
    const contentSlice = splitGalnetContent(news.content!)
    const translationAttempt = await translateGalnetArticleWithRetry(news.title!, contentSlice)
    const translatedNews = translationAttempt.translatedNews
    let diagnosticText = ''

    if (!translatedNews) {
      const finalError = translationAttempt.finalError
      translateErrorString = telegramHTMLEscape(
        finalError ? getErrorMessage(finalError) : 'Galnet translation failed.'
      )
      diagnosticText = buildTranslationDiagnostic(
        persistConfig.entries.openrouter.model,
        translationAttempt.attempts,
        translationAttempt.retryScheduleUsed,
        news.url!,
        finalError
      )
    }

    const titleTranslated = [
      news.title,
      telegramHTMLEscape(translatedNews?.title || '')
    ].join('\n')
    const contentTranslated = contentSlice.map((line, index) => {
      const translatedLine = translatedNews?.paragraphs[index] || ''

      return [
        line,
        translatedLine
      ].join('\n')
    })
    if (!translatedNews && !translateErrorString) {
      translateErrorString = 'Galnet translation failed.'
    }
    if (diagnosticText) {
      await telemetry(
        `modules/galnet.ts/worker`,
        diagnosticText)
    }
    const params = news
    for (const [i, v] of Object.entries(params)) {
      if (isString(v)) {
        // @ts-expect-error key type problem
        params[i] = telegramHTMLEscape(v!)
      }
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
    if (diagnosticText) {
      await sendTranslationDiagnostic(botName, config.actions, diagnosticText)
    }
    await sleep(15000)
    currentStore.startFrom = news.timestamp
  }
}

const run = (botName: string) => {
  worker(botName)
    .catch((...args) => telemetry('modules/galnet.ts/worker', ...args))
    .finally(() => {
      setTimeout(
        () => run(botName),
        configs[botName as TelegramBotName].updateInterval
      )
    })
}

Object.keys(configs).forEach((el) => run(el))
