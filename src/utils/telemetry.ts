import { isString } from 'lodash-es'
import { stringify } from './lang'
import promiseRetry from 'promise-retry'
import register from '../register'
import bot from '../interface/telegram'

export default async (...log: any[]) => {
  let res = ''
  log.forEach((el) => {
    if (isString(el)) {
      res = res.concat(el).concat('\n')
    } else {
      res = res.concat(stringify(el)).concat('\n')
    }
  })
  return Promise.all(
    register.sendAlertToTelegramAccount.map((target) =>
      promiseRetry(
        (retry) =>
          bot.misaka.bot.telegram.sendMessage(target, res).catch(retry),
      ).then()
    )
  )
}
