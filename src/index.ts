import bot from './interface/bot'
import './module/chat-bridge'

bot.startPolling(10, 100)
console.log('server started')
setInterval(() => {}, 86400000)
