import 'core-js/stable'
import 'regenerator-runtime/runtime'
import bot from './interface/bot'

import './module/chat-bridge'
import './module/get-user-info'
import './module/ping'
import './module/start'
import './module/twitter-forwarding'
import './module/ywwuyi-live'

const gracefulStopHandler = () => {
  for (const operator of Object.values(bot)) {
    operator.bot.stop().then()
  }
}

process.once('SIGINT', gracefulStopHandler)
process.once('SIGTERM', gracefulStopHandler)
