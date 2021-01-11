import { eventBus } from '../interface/bot'

eventBus.command.sub(async ({ ctx, meta }) => {
  if (meta.commandName !== 'getUserInfo' || !ctx.chat) return
  ctx.telegram
    .sendMessage(
      ctx.chat.id,
      [
        `Hi ${ctx.chat.first_name || ctx.chat.title} ${
          ctx.chat.last_name || ''
        }`,
        `chatId: ${ctx.chat.id}`,
        ...(ctx.chat.username ? [`userName: ${ctx.chat.username}`] : []),
        `chatType: ${ctx.chat.type}`,
      ].join('\n')
    )
    .then()
})
