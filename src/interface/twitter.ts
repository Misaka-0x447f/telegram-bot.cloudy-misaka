/* eslint-disable camelcase */
import got, { CancelableRequest } from 'got'
import persistConfig from "../utils/configFile";

type TwitterErrors = Array<{ title: string; detail: string; type: string }>

const toTwitterTime = (time?: Date) => {
  if (!time) return
  return new Date(
    Math.max(
      new Date(time).getTime(),
      new Date('2010-11-06T00:00:00Z').getTime()
    )
  )
    .toISOString()
    .replace(/\.\d{3}/, '')
}

const authHeader = () => ({
  Authorization: `Bearer ${persistConfig.entries.master.tokenTwitter}`,
})

export const getUserByUsername = (username: string) =>
  got
    .get(`https://api.twitter.com/2/users/by/username/${username}`, {
      headers: authHeader(),
    })
    .json() as CancelableRequest<{
    data?: {
      id: string
      name: string
      username: string
    }
    errors?: TwitterErrors
  }>

export const getTweetTimelineById = (
  userId: string,
  {
    excludeReplies = false,
    excludeRetweets = false,
    startTime = undefined as Date | undefined,
    endTime = undefined as Date | undefined,
  } = {}
) => {
  const exclude = []
  if (excludeReplies) exclude.push('replies')
  if (excludeRetweets) exclude.push('retweets')
  return got
    .get(`https://api.twitter.com/2/users/${userId}/tweets`, {
      searchParams: {
        exclude: exclude.join(','),
        start_time: toTwitterTime(startTime),
        end_time: toTwitterTime(endTime),
      },
      headers: authHeader(),
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
}

export const getTweetById = (tweetId: string) =>
  got
    .get(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=entities&expansions=author_id&user.fields=public_metrics`,
      {
        headers: authHeader(),
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
