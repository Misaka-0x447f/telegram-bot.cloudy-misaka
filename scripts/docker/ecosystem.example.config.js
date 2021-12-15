module.exports = {
  apps: [
    {
      name: 'misaka-telegram-bot',
      script: './dist/index.js',
      env: {
        CONFIG_PATH: 'https://config-path/ or ./config-path'
      }
    }
  ]
}
