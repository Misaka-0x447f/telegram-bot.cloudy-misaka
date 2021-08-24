import { isString } from 'lodash-es'
import { stringify } from './lang'
import promiseRetry from 'promise-retry'
import bot from '../interface/telegram'
import configFile from "./configFile";

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
    configFile.entries.master.insight.telegramSupervisor.map((target) =>
      promiseRetry(
        (retry) =>
          bot.misaka.instance.telegram.sendMessage(target, res).catch(retry),
      ).then()
    )
  )
}
