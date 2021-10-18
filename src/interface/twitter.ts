/* eslint-disable camelcase */
import got, { CancelableRequest } from 'got'
import persistConfig from '../utils/configFile'
import { HttpsProxyAgent } from 'hpagent'
import { Queue } from '../utils/queue'
import { SocksProxyAgent } from 'socks-proxy-agent'

type TwitterErrors = Array<{ title: string; detail: string; type: string }>

const queue = new Queue('twitter api')

const authHeader = () => ({
  Authorization: `Bearer ${persistConfig.entries.tokenTwitter}`
})

export const getUserByUsername = (username: string) =>
  queue.push(() => got
    .get(`https://api.twitter.com/2/users/by/username/${username}`, {
      headers: authHeader()
    })
    .json() as CancelableRequest<{
    data?: {
      id: string
      name: string
      username: string
    }
    errors?: TwitterErrors
  }>)

export const getTweetTimelineById = (
  userId: string,
  {
    excludeReplies = false,
    excludeRetweets = false
  } = {}
) => queue.push(() => {
  const exclude = []
  if (excludeReplies) exclude.push('replies')
  if (excludeRetweets) exclude.push('retweets')
  return got
    .get(`https://api.twitter.com/2/users/${userId}/tweets`, {
      searchParams: {
        exclude: exclude.join(',')
      },
      headers: authHeader(),
      agent: process.env.HTTP_PROXY // @ts-ignore
        ? { https: new HttpsProxyAgent(process.env.HTTP_PROXY) }
        : process.env.SOCKS_PROXY ? { https: new SocksProxyAgent(process.env.SOCKS_PROXY) } : {}
    })
    .json() as CancelableRequest<{
    data?: Array<{ id: string; text: string }>
    meta?: {
      oldest_id: string
      newest_id: string
      result_count: 10
      next_token: string
    }
    errors?: TwitterErrors
  }>
})

export const getTweetById = (tweetId: string) =>
  queue.push(() => got
    .get(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=entities&expansions=author_id&user.fields=public_metrics`,
      {
        headers: authHeader()
      }
    )
    .json() as CancelableRequest<{
    data: {
      text: string
      id: string
      author_id: string
    }
    includes: {
      users: [
        {
          public_metrics: {
            followers_count: number
            following_count: number
            tweet_count: number
            listed_count: number
          }
        }
      ]
    }
  }>
  )
