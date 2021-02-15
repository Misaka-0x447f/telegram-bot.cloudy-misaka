// @ts-ignore
import telemetry from './telemetry'

export { default as stringify } from 'json-stringify-safe'

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const rand = (start = 0, stop = 1) =>
  Math.random() * (stop - start) + start

export const formatMinute = (minute: number) =>
  `${Math.floor(minute / 60)}小时${Math.round(minute % 60)
    .toString()
    .padStart(2, '0')}分钟`

export const limitRunTime = (
  task: any,
  { timeLimit = 60000, taskName = '' } = {}
) =>
  Promise.race([
    task,
    async () => {
      await sleep(timeLimit)
      return {
        error: taskName.length
          ? `time limit exceeded ${timeLimit}ms on task ${taskName}.`
          : `time limit exceed ${timeLimit}ms.`,
      }
    },
  ]).then((res) => {
    if (res.error) {
      telemetry(res.error)
    }
  })
