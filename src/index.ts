import 'core-js/stable'
import 'regenerator-runtime/runtime'
import { bot } from './interface/bot'

import './module/chat-bridge'
import './module/get-user-info'
import './module/ping'
import './module/start'
import './module/twitter-forwarding'

// Enable graceful stop
process.once('SIGINT', () => bot.stop())
process.once('SIGTERM', () => bot.stop())
