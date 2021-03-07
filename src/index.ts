import 'core-js/stable'
import 'regenerator-runtime/runtime'
import bot from './interface/bot'

import './module/bili-live'
import './module/chat-bridge'
import './module/fetch-sticker'
import './module/fetch-video'
import './module/get-user-info'
import './module/ping'
import './module/say'
import './module/send-message-on-http-request'
import './module/start'
import './module/twitter-forwarding'
import './module/ywwuyi-douyu-live'
import './module/repeater'

const gracefulStopHandler = () => {
  for (const operator of Object.values(bot)) {
    operator.bot.stop().then()
  }
}

process.once('SIGINT', gracefulStopHandler)
process.once('SIGTERM', gracefulStopHandler)
