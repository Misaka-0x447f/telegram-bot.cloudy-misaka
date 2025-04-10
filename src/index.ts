import 'core-js/stable'
import 'regenerator-runtime/runtime'
import persistConfig from './utils/persistConfig'
import telemetry, { telemetryInit } from './utils/telemetry'
import promiseRetry from 'promise-retry'

persistConfig.init().then(async () => {
  telemetryInit()
  const bot = await import('./interface/telegram')
  import('./modules/index').catch((...args) => telemetry('index.ts/moduleLoader', ...args))

  persistConfig.entries.insight.telegramSupervisor.map((target) =>
    promiseRetry(async (retry) => {
      bot.exportBot.misaka
        .sendMessage(target, `System boot completed. ${process.env.BUILT_STRING}`)
        .catch(retry)
    })
  )

  const gracefulStopHandler = async () => {
    for (const operator of Object.values(bot.default)) {
      operator.instance.stop().then()
    }
    await Promise.all(
      persistConfig.entries.insight.telegramSupervisor.map((target) =>
        promiseRetry(async (retry) => {
          bot.exportBot.misaka
            .sendMessage(target, 'Shutting down.')
            .catch(retry)
        })
      )
    )
    process.exit(0)
  }
  process.once('SIGINT', gracefulStopHandler)
  process.once('SIGTERM', gracefulStopHandler)
})
