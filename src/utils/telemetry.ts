import { isString } from 'lodash-es'
import { stringify } from './lang'
import promiseRetry from 'promise-retry'
import register from '../register'
import bot from '../interface/bot'

export default (...log: any[]) => {
  let res = ''
  log.forEach((el) => {
    if (isString(el)) {
      res = res.concat(el).concat('\n')
    } else {
      res = res.concat(stringify(el)).concat('\n')
    }
  })
  register.sendAlertToTelegramAccount.forEach((target) => {
    promiseRetry(
      (retry) => bot.misaka.bot.telegram.sendMessage(target, res).catch(retry),
      {
        retries: 3,
      }
    ).then()
  })
}
