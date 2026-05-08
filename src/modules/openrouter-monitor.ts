import { getTelegramBotByAnyBotName } from '../interface/telegram'
import {
  fetchOpenRouterCredits,
  fetchOpenRouterKeyInfo,
  OpenRouterCredits,
  OpenRouterKeyInfo
} from '../interface/openrouter'
import telemetry from '../utils/telemetry'
import persistConfig from '../utils/persistConfig'
import { TelegramBotName } from '../utils/type'

const configs = persistConfig.entries.openrouterMonitor

type OpenRouterAlertSnapshot = {
  balance?: OpenRouterCredits
  keyInfo: OpenRouterKeyInfo
  reasonCodes: string[]
}

const alertStore: Partial<Record<TelegramBotName, string>> = {}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const formatPercent = (value: number) => (value * 100).toFixed(2)

const buildSnapshot = async (botName: string) => {
  const config = configs[botName as TelegramBotName]
  const keyInfo = await fetchOpenRouterKeyInfo(persistConfig.entries.openrouter.token)
  const balance = persistConfig.entries.openrouter.managementKey
    ? await fetchOpenRouterCredits(persistConfig.entries.openrouter.managementKey)
    : undefined
  const reasonCodes: string[] = []

  if (
    typeof config.balanceAlertThreshold === 'number' &&
    balance &&
    balance.remainingCredits < config.balanceAlertThreshold
  ) {
    reasonCodes.push('low_balance')
  }

  if (
    typeof config.quotaRemainingPercentageAlertThreshold === 'number' &&
    typeof keyInfo.limit === 'number' &&
    keyInfo.limit > 0 &&
    typeof keyInfo.limitRemaining === 'number'
  ) {
    const remainingRatio = keyInfo.limitRemaining / keyInfo.limit

    if (remainingRatio < config.quotaRemainingPercentageAlertThreshold) {
      reasonCodes.push('low_quota')
    }
  }

  return {
    balance,
    keyInfo,
    reasonCodes
  } as OpenRouterAlertSnapshot
}

const buildAlertParams = (snapshot: OpenRouterAlertSnapshot) => {
  const limit = snapshot.keyInfo.limit
  const limitRemaining = snapshot.keyInfo.limitRemaining
  const quotaRemainingPercentage =
    typeof limit === 'number' &&
    limit > 0 &&
    typeof limitRemaining === 'number'
      ? formatPercent(limitRemaining / limit)
      : undefined

  return {
    alertReasons: snapshot.reasonCodes.join(','),
    apiKeyLabel: snapshot.keyInfo.label,
    isFreeTier: snapshot.keyInfo.isFreeTier ? 'true' : 'false',
    limit,
    limitRemaining,
    limitReset: snapshot.keyInfo.limitReset,
    quotaRemainingPercentage,
    remainingCredits: snapshot.balance?.remainingCredits,
    totalCredits: snapshot.balance?.totalCredits,
    totalUsage: snapshot.balance?.totalUsage,
    usage: snapshot.keyInfo.usage,
    usageDaily: snapshot.keyInfo.usageDaily,
    usageMonthly: snapshot.keyInfo.usageMonthly,
    usageWeekly: snapshot.keyInfo.usageWeekly
  }
}

const runAlertActions = async (
  botName: string,
  actions: typeof configs[TelegramBotName]['alertActions'],
  snapshot: OpenRouterAlertSnapshot
) => {
  const bot = getTelegramBotByAnyBotName(botName)
  const config = configs[botName as TelegramBotName]

  await bot.runActions(
    actions,
    { defaultChatId: config.dest || 0 },
    buildAlertParams(snapshot)
  )
}

const worker = async (botName: string) => {
  const config = configs[botName as TelegramBotName]
  const snapshot = await buildSnapshot(botName)
  const currentSignature = snapshot.reasonCodes.sort().join('|')
  const previousSignature = alertStore[botName as TelegramBotName] || ''

  if (currentSignature && currentSignature !== previousSignature) {
    await runAlertActions(botName, config.alertActions, snapshot)
  }

  if (!currentSignature && previousSignature && config.recoverActions) {
    await runAlertActions(botName, config.recoverActions, snapshot)
  }

  alertStore[botName as TelegramBotName] = currentSignature

  return config.pollingInterval
}

for (const [botName] of Object.entries(configs)) {
  const run = () => {
    worker(botName)
      .catch(async (error) => {
        await telemetry('modules/openrouter-monitor.ts/worker', getErrorMessage(error))
        return configs[botName as TelegramBotName].pollingInterval
      })
      .then((delay) => {
        setTimeout(() => run(), delay)
      })
  }

  run()
}
