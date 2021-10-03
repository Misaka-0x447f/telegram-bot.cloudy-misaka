import { isString } from 'lodash-es'
import { stringify } from './lang'
import promiseRetry from 'promise-retry'
import { ApplicationInsights } from '@microsoft/applicationinsights-web'
import persistConfig from './configFile'

export const insights = new ApplicationInsights({
  config: {
    instrumentationKey: persistConfig.entries.insight.azureSecret
  }
})
insights.loadAppInsights()
insights.trackPageView()

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
    persistConfig.entries.insight.telegramSupervisor.map((target) =>
      promiseRetry(async (retry) =>
        (await import('../interface/telegram')).exportBot.misaka.instance.telegram.sendMessage(target, res).catch(retry)
      ).then()
    )
  )
}
