import { isString } from 'lodash-es'
import { stringify } from './lang'
import promiseRetry from 'promise-retry'
import { ApplicationInsights } from '@microsoft/applicationinsights-web'
import persistConfig from './persistConfig'
import fsj from 'fs-jetpack'

export let insights: ApplicationInsights

export const telemetryInit = () => {
  insights = new ApplicationInsights({
    config: {
      instrumentationKey: persistConfig.entries.insight.azureSecret
    }
  })
  insights.loadAppInsights()
  insights.trackPageView()
}

const reportPath = './tmp/telemetry-buffer'

const sendReport = async (text?: string) => {
  const res = text || 'Error log summary in past 1 hrs: ' + fsj.read(reportPath)
  await Promise.all(persistConfig.entries.insight.telegramSupervisor.map((target) =>
    promiseRetry(async (retry) =>
      (await import('../interface/telegram')).exportBot.misaka.instance.telegram.sendMessage(target, res).catch(retry)
    ).then()
  ))
}

export default async (label: string, ...log: any[]) => {
  console.error(...log)
  let res = ''
  log.forEach((el) => {
    if (isString(el)) {
      res = res.concat(`[${label}]`).concat(el.substring(0, 300)).concat('\n')
    } else {
      res = res.concat(`[${label}]`).concat(stringify(el).substring(0, 300)).concat('\n')
    }
  })
  const logFile = fsj.read(reportPath)
  if (!logFile) {
    sendReport(res).then()
    setTimeout(() => {
      sendReport().then(
        () => fsj.remove(reportPath))
    }, 3600000)
  }
  fsj.append(reportPath, res, {})
}
