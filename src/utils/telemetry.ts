import { isString } from 'lodash-es'
import { stringify } from './lang'
import promiseRetry from 'promise-retry'
import { bot } from '../interface/bot'
import register from '../register'

export default (...log: any[]) => {
  let res = 'MisakaBot 发生了一个错误。\n'
  log.forEach((el) => {
    if (isString(el)) {
      res = res.concat(el).concat('\n')
    } else {
      res = res.concat(stringify(el)).concat('\n')
    }
  })
  register.sendAlertToTelegramAccount.forEach((target) => {
    promiseRetry((retry) => bot.telegram.sendMessage(target, res).catch(retry)).then()
  })
}
