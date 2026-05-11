import { getTelegramBotByAnyBotName } from '../interface/telegram'
import { fetchEliteServerStatus } from '../interface/edsm'
import telemetry from '../utils/telemetry'
import persistConfig from '../utils/persistConfig'
import { TelegramBotName } from '../utils/type'

const configs = persistConfig.entries.galnetStatus

type ServerAvailability = 'degraded' | 'success'

type ServerStatusSnapshot = {
  availability: ServerAvailability
  lastUpdate?: string
  message: string
  status?: number
  type: string
}

const statusStore: Partial<Record<TelegramBotName, ServerStatusSnapshot>> = {}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const toAvailability = (type: string): ServerAvailability => {
  if (type === 'success') {
    return 'success'
  }

  return 'degraded'
}

const buildStatusSnapshot = async () => {
  try {
    const response = await fetchEliteServerStatus()

    return {
      availability: toAvailability(response.type),
      lastUpdate: response.lastUpdate,
      message: response.message,
      status: response.status,
      type: response.type
    } as ServerStatusSnapshot
  } catch (error) {
    await telemetry(
      'modules/galnet-status.ts/buildStatusSnapshot',
      getErrorMessage(error)
    )

    return {
      availability: 'degraded',
      lastUpdate: undefined,
      message: getErrorMessage(error),
      status: undefined,
      type: 'fetch_error'
    } as ServerStatusSnapshot
  }
}

const buildActionParams = (
  current: ServerStatusSnapshot,
  previous?: ServerStatusSnapshot
) => ({
  isAvailable: current.availability === 'success' ? 'true' : 'false',
  lastUpdate: current.lastUpdate,
  previousMessage: previous?.message,
  previousStatusCode: previous?.status,
  previousStatusType: previous?.type,
  statusCode: current.status,
  statusMessage: current.message,
  statusType: current.type
})

const runStatusActions = async (
  botName: string,
  actions: typeof configs[TelegramBotName]['startupActions'],
  current: ServerStatusSnapshot,
  previous?: ServerStatusSnapshot
) => {
  if (!actions) {
    return
  }

  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]

  await bot.runActions(
    actions,
    { defaultChatId: config.dest || 0 },
    buildActionParams(current, previous)
  )
}

const worker = async (botName: string) => {
  const config = configs[botName as TelegramBotName]
  const previous = statusStore[botName as TelegramBotName]
  const current = await buildStatusSnapshot()

  if (!previous) {
    await runStatusActions(botName, config.startupActions, current)
  } else if (previous.availability === 'success' && current.availability !== 'success') {
    await runStatusActions(botName, config.outageActions, current, previous)
  } else if (previous.availability !== 'success' && current.availability === 'success') {
    await runStatusActions(botName, config.recoverActions, current, previous)
  }

  statusStore[botName as TelegramBotName] = current

  if (current.availability === 'success') {
    return config.pollingIntervalOnSuccess
  }

  return config.pollingIntervalOnFailure
}

for (const [botName] of Object.entries(configs)) {
  const run = () => {
      worker(botName)
      .catch(async (error) => {
        await telemetry('modules/galnet-status.ts/worker', getErrorMessage(error))
        return configs[botName as TelegramBotName].pollingIntervalOnFailure
      })
      .then((delay) => {
        setTimeout(() => run(), delay)
      })
  }

  run()
}
