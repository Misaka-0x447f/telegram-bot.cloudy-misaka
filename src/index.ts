import 'core-js/stable'
import 'regenerator-runtime/runtime'
import persistConfig from './utils/configFile'

persistConfig.init()

;(async () => {
  const bot = await import('./interface/telegram')
  // import('./module/bili-live')
  // import('./module/chat-bridge')
  // import('./module/fetch-sticker')
  // import('./module/fetch-video')
  // import('./module/get-user-info')
  import('./module/ping')
  // import('./module/say')
  // import('./module/send-message-on-http-request')
  // import('./module/start')
  // import('./module/twitter-forwarding')
  // import('./module/legacy/ywwuyi-douyu-live')
  // import('./module/repeater')

  const gracefulStopHandler = () => {
    for (const operator of Object.values(bot.default)) {
      operator.bot.stop().then()
    }
  }
  process.once('SIGINT', gracefulStopHandler)
  process.once('SIGTERM', gracefulStopHandler)
})()
