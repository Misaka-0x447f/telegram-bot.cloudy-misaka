module.exports = (slimbot: any) => {
  slimbot.on('channel_post', (message: any) => {
    console.log(message)
  })
}
