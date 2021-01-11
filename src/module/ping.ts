import promiseRetry from 'promise-retry'
import bot from '../interface/bot'

bot.misaka.message.sub(async ({ ctx, message, currentChat }) => {
  const isPing =
    (message.text?.includes('/ping') && message.chat.type === 'private') ||
    (message.text?.includes('/ping@Misaka_0x447f_bot') &&
      message.chat.type !== 'private')
  if (isPing) {
    promiseRetry(
      (retry, number) =>
        ctx.telegram
          .sendMessage(
            currentChat.id,
            `Alive until sunset. \n${new Date().toUTCString()}`
          )
          .catch((e) => {
            retry(e)
            console.log(e)
            console.log(`Attempting to retry ${number}`)
          }),
      { maxRetryTime: 10000 }
    ).then()
  }
})
