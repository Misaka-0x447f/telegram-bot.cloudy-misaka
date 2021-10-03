module.exports = {
  apps: [
    {
      name: 'misaka-telegram-bot',
      script: './loader.js',
      env: {
        CONFIG_PATH: 'https://config-path/ or ./config-path'
      }
    }
  ]
}
