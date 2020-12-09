import 'core-js/stable'
import 'regenerator-runtime/runtime'
import bot from './interface/bot'
import './module/chat-bridge'

bot.startPolling(30, 100)
console.log('server started')
setInterval(() => {}, 86400000)
