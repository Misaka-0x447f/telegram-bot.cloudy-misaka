import 'core-js/stable'
import 'regenerator-runtime/runtime'
import persistConfig from './utils/configFile'
import { telemetryInit } from './utils/telemetry'

persistConfig.init().then(async () => {
  telemetryInit()
  const bot = await import('./interface/telegram')
  import('./module/index')

  const gracefulStopHandler = () => {
    for (const operator of Object.values(bot.default)) {
      operator.instance.stop().then()
    }
  }
  process.once('SIGINT', gracefulStopHandler)
  process.once('SIGTERM', gracefulStopHandler)
})
