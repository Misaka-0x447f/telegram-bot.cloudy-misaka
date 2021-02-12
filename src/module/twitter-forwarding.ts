import { getTweetTimelineById, getUserByUsername } from '../interface/twitter'
import store from '../store'
import telemetry from '../utils/telemetry'
import { HTTPError } from 'got'
import bot from '../interface/bot'
import { isFunction } from 'lodash-es'
import { sendMessage } from '../interface/lark'

export const twitterForwardingList: Array<{
  operator: typeof bot.misaka
  from: string
  to: Array<number | ((key: { content: string }) => number | null)>
  options: Parameters<typeof getTweetTimelineById>[1]
}> = [
  {
    operator: bot.misaka,
    from: 'MisakaKumomi',
    to: [
      -1001465692020,
      -1001158764878,
      1244020370,
      ({ content }) =>
        content.toLowerCase().includes('#arcaea') ? -1001150518332 : null,
    ],
    options: { excludeReplies: true },
  },
  {
    operator: bot.ywwuyi,
    from: 'ywwuyi',
    to: [
      -1001322798787,
      ({ content }) => {
        sendMessage(content, 'oc_dcc61de5e98beecfd87045c3df9a9744').then()
        return null
      },
    ],
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
            const target = isFunction(tgMessageTarget)
              ? tgMessageTarget({ content: el.text })
              : tgMessageTarget
            if (target === null) return
            await val.operator.sendMessage(target, el.text)
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
    setTimeout(() => main(new Date(new Date(now).getTime() + 1000)), twitterForwardingList.length * 15000)
  }
  await main()
})()

console.log('twitter-forwarding ready.')
