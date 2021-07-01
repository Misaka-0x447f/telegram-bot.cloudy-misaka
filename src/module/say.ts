import bot from '../interface/telegram'
import register from '../register'

const contactConfigs = [
  {
    operator: bot.misaka,
    list: [
      { name: 'misaka', id: -1001465692020 },
      { name: 'patchy', id: -1001150518332 },
      { name: 'ywwuyi', id: -1001322798787 },
    ],
  },
  {
    operator: bot.ywwuyi,
    list: [{ name: 'ywwuyi', id: -1001322798787 }],
  },
]

const handler = () => {
  for (const contact of contactConfigs) {
    contact.operator.command.sub(async ({ ctx, meta }) => {
      const chatId = ctx.message?.chat.id!
      if (meta.commandName !== 'say' || !chatId) return
      if (!register.superuser.includes(chatId)) {
        await contact.operator.sendMessage(chatId, 'Permission denied.')
        return
      }
      const helpMessage = `arguments: [contact]\nwhere contact can be one of the following: ${contact.list
        .map((el) => el.name)
        .concat('; ')}`
      for (const to of contact.list) {
        if (to.name === meta.args[0]) {
          if (!ctx.message?.reply_to_message) {
            await contact.operator.sendMessage(chatId, 'Reply to a message to say.')
            return
          }
          await ctx.telegram.sendCopy(to.id, ctx.message?.reply_to_message)
          await contact.operator.sendMessage(chatId, `success.`)
          return
        }
      }
      await contact.operator.sendMessage(
        chatId,
        `too few arguments or unknown contact. ${helpMessage}`
      )
    })
  }
}

handler()
