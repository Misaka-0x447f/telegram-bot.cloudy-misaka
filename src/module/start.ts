import bot from '../interface/bot'
import { rand, sleep } from '../utils/lang'

bot.misaka.command.sub(async ({ ctx, meta }) => {
  if (meta.commandName !== 'start' || !ctx.message) return
  await sleep(rand(1000, 2000))
  await ctx.telegram.sendMessage(ctx.message.chat.id, 'Emmm')
  await sleep(rand(3000, 7000))
  await ctx.telegram.sendMessage(
    ctx.message.chat.id,
    'Hi? Misaka is just a bot that not connected to a misaka intelligence processor, so you need to reach out the misaka who has write permission to me at t.me/Misaka_0x447f'
  )
  await sleep(rand(3000, 5000))
  await ctx.telegram.forwardMessage(ctx.message.chat.id, 143847141, 237)
})
