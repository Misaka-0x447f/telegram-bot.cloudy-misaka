import { Telegraf } from 'telegraf'

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Env [TELEGRAM_BOT_TOKEN] was not set. Exiting.')
  process.exit()
}

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

// username enables receiving group message. https://github.com/telegraf/telegraf/issues/134
// note: you will need to kick bot then invite it again to receive group message.
// https://github.com/yagop/node-telegram-bot-api/issues/174
bot.telegram.getMe().then((botInfo) => {
  console.log(`Connected as ${botInfo.username}`)
  bot.options.username = botInfo.username
})

export default bot
