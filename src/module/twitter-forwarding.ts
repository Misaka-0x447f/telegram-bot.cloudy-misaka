import { getTweetTimelineById, getUserByUsername } from '../interface/twitter'
import promiseRetry from 'promise-retry'
import store from '../store'
import telemetry from '../utils/telemetry'
import { HTTPError } from 'got'
import bot from '../interface/bot'

export const twitterForwardingList = [
  {
    operator: bot.misaka,
    from: 'MisakaKumomi',
    to: [-1001465692020, 1244020370],
    options: { excludeReplies: true },
  },
  {
    operator: bot.ywwuyi,
    from: 'ywwuyi',
    to: [-1001322798787],
    options: { excludeReplies: true },
  },
]
;(async () => {
  for (const val of twitterForwardingList) {
    const { data } = await getUserByUsername(val.from)
    if (data?.id) {
      store.twitterForwardingList.push({
        ...val,
        from: data?.id,
      })
    }
  }
  const worker = async (startTime: Date, endTime: Date) => {
    for (const val of store.twitterForwardingList) {
      const recentTweets = await getTweetTimelineById(val.from, {
        ...val.options,
        startTime,
        endTime,
      }).catch((err: HTTPError) => {
        console.error(err)
        telemetry(err.message, err)
      })
      if (recentTweets && recentTweets?.data) {
        for (const el of recentTweets.data) {
          for (const tgMessageTarget of val.to) {
            await promiseRetry((retry) =>
              val.operator.bot.telegram
                .sendMessage(tgMessageTarget, el.text)
                .catch((e) => retry(e))
            )
          }
        }
      }
    }
  }
  const main = async (startTime?: Date) => {
    const now = new Date()
    if (startTime) {
      await worker(startTime, now)
    }
    setTimeout(() => main(new Date(new Date(now).getTime() + 1000)), 20000)
  }
  await main()
})()
