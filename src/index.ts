// @ts-ignore
const Slimbot = require('slimbot')
const chatBridge = require('./module/chat-bridge')

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Env [TELEGRAM_BOT_TOKEN] was not set. Exiting.')
  process.exit()
}

const slimbot = new Slimbot(process.env.TELEGRAM_BOT_TOKEN)
chatBridge(slimbot)

setInterval(() => 0, 86400)
