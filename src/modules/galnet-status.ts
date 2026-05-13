import { HTTPError, RequestError } from 'got'
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

type StatusBuildResult =
  | {
    kind: 'http_error'
    snapshot: ServerStatusSnapshot
  }
  | {
    kind: 'http_status'
    snapshot: ServerStatusSnapshot
  }

type StatusState = {
  lastHttpStatus?: ServerStatusSnapshot
  non200AlertActive: boolean
  non200ConsecutiveCount: number
}

const statusStore: Partial<Record<TelegramBotName, StatusState>> = {}

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

const shouldTriggerNon200Actions = (count: number) =>
  count === 3 || count === 9 || (count >= 27 && count % 27 === 0)

const getStatusState = (botName: TelegramBotName) => {
  if (!statusStore[botName]) {
    statusStore[botName] = {
      lastHttpStatus: undefined,
      non200AlertActive: false,
      non200ConsecutiveCount: 0
    }
  }

  return statusStore[botName]!
}

const buildStatusSnapshot = async (): Promise<StatusBuildResult> => {
  try {
    const response = await fetchEliteServerStatus()

    return {
      kind: 'http_status',
      snapshot: {
        availability: toAvailability(response.type),
        lastUpdate: response.lastUpdate,
        message: response.message,
        status: response.status,
        type: response.type
      }
    }
  } catch (error) {
    await telemetry(
      'modules/galnet-status.ts/buildStatusSnapshot',
      getErrorMessage(error)
    )

    if (error instanceof HTTPError || error instanceof RequestError) {
      return {
        kind: 'http_error',
        snapshot: {
          availability: 'degraded',
          lastUpdate: undefined,
          message: getErrorMessage(error),
          status: error instanceof HTTPError ? error.response.statusCode : undefined,
          type: 'http_error'
        }
      }
    }

    return {
      kind: 'http_status',
      snapshot: {
        availability: 'degraded',
        lastUpdate: undefined,
        message: getErrorMessage(error),
        status: undefined,
        type: 'payload_error'
      }
    }
  }
}

const buildActionParams = (
  current: ServerStatusSnapshot,
  previous?: ServerStatusSnapshot,
  non200ConsecutiveCount?: number
) => ({
  isAvailable: current.availability === 'success' ? 'true' : 'false',
  lastUpdate: current.lastUpdate,
  non200ConsecutiveCount,
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
  previous?: ServerStatusSnapshot,
  non200ConsecutiveCount?: number
) => {
  if (!actions) {
    return
  }

  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]

  await bot.runActions(
    actions,
    { defaultChatId: config.dest || 0 },
    buildActionParams(current, previous, non200ConsecutiveCount)
  )
}

const worker = async (botName: string) => {
  const config = configs[botName as TelegramBotName]
  const state = getStatusState(botName as TelegramBotName)
  const currentResult = await buildStatusSnapshot()

  if (currentResult.kind === 'http_error') {
    state.non200ConsecutiveCount += 1

    if (shouldTriggerNon200Actions(state.non200ConsecutiveCount)) {
      await runStatusActions(
        botName,
        config.non200Actions,
        currentResult.snapshot,
        state.lastHttpStatus,
        state.non200ConsecutiveCount
      )
      state.non200AlertActive = true
    }

    return config.pollingIntervalOnFailure
  }

  const current = currentResult.snapshot
  const previous = state.lastHttpStatus
  const previousNon200ConsecutiveCount = state.non200ConsecutiveCount

  state.non200ConsecutiveCount = 0

  if (state.non200AlertActive) {
    await runStatusActions(
      botName,
      config.non200RecoverActions,
      current,
      previous,
      previousNon200ConsecutiveCount
    )
    state.non200AlertActive = false
  }

  if (!previous) {
    await runStatusActions(botName, config.startupActions, current)
  } else if (previous.availability === 'success' && current.availability !== 'success') {
    await runStatusActions(botName, config.outageActions, current, previous)
  } else if (previous.availability !== 'success' && current.availability === 'success') {
    await runStatusActions(botName, config.recoverActions, current, previous)
  }

  state.lastHttpStatus = current

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
