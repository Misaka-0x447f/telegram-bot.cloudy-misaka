import persistConfig from '../utils/persistConfig'
import { HttpsProxyAgent } from 'hpagent'
import { Queue } from '../utils/queue'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { TwitterApi } from 'twitter-api-v2'
import telemetry from '../utils/telemetry'

const queue = new Queue('twitter api')

const userClient = new TwitterApi(persistConfig.entries.tokenTwitter, {
  httpAgent: process.env.HTTP_PROXY // @ts-ignore
    ? new HttpsProxyAgent(process.env.HTTP_PROXY)
    : process.env.SOCKS_PROXY ? new SocksProxyAgent(process.env.SOCKS_PROXY) : undefined
}).v1

export const getTweetTimelineById = (
  userId: string,
  {
    excludeReplies = false,
    excludeRetweets = false
  } = {}
) => queue.push(async () => {
  /**
   * @see https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/api-reference/get-users-id-tweets
   */
  return userClient.userTimeline(userId, {
    exclude_replies: excludeReplies,
    include_rts: !excludeRetweets
  }).then(el => {
    return {
      data: el.tweets.map(el => ({
        id: el.id,
        text: el.full_text
      }))
    }
  }).catch(el => {
    telemetry(el)
  })
})
