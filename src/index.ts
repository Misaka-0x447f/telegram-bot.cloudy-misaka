import 'core-js/stable'
import 'regenerator-runtime/runtime'
import persistConfig from './utils/configFile'

persistConfig.init().then(async () => {
  import('./utils/telemetry')
  const bot = await import('./interface/telegram')
  import('./module/bili-live')
  import('./module/chat-bridge')
  import('./module/fetch-sticker')
  import('./module/fetch-video')
  import('./module/get-user-info')
  import('./module/ping')
  import('./module/repeater')
  import('./module/say')
  import('./module/legacy/send-message-on-http-request')
  import('./module/start')
  import('./module/twitter-forwarding')

  const gracefulStopHandler = () => {
    for (const operator of Object.values(bot.default)) {
      operator.instance.stop().then()
    }
  }
  process.once('SIGINT', gracefulStopHandler)
  process.once('SIGTERM', gracefulStopHandler)
})
