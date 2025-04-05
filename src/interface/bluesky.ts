import persistConfig from '../utils/persistConfig'
import { Queue } from '../utils/queue'
import { BskyAgent } from "@atproto/api";

const queue = new Queue('bluesky api')

const agent = new BskyAgent({service: persistConfig.entries.tokenBsky.service})

export type BlueskyPost = {
  id: string,
  text: string,
  unixTimeStamp: number,
  url: string,
}

let loggedIn = false

export const getFeedByHandle = (
  handle: string,
  {
    limit = 20,
    excludeReplies = false
  } = {}
) => queue.push(async () => {
  if (!loggedIn) {
    await agent.login({
      identifier: persistConfig.entries.tokenBsky.identifier,
      password: persistConfig.entries.tokenBsky.password
    })
    loggedIn = true
  }
  return agent.getAuthorFeed({
    actor: handle,
    limit,
    filter: excludeReplies ? 'posts_no_replies' : undefined,
    includePins: false
  }).then(el => {
    return {
      data: el.data.feed.map(post => {
        const postId = post.post.uri.match(/\/(\w+)$/)?.[1]
        if (!postId) {
          throw new Error(`cannot find bluesky post id. post uri: ${post.post.uri}`)
        }
        return {
          id: post.post.cid,
          // @ts-expect-error undocumented feature
          text: post.post.record.text,
          // @ts-expect-error undocumented feature
          unixTimeStamp: new Date(post.reason?.indexedAt ?? post.post.record?.createdAt).getTime(),
          url: `https://bsky.app/profile/${handle}/post/${postId ?? 'cannot-find-post-id'}`
        } as BlueskyPost
      })
    }
  })
})
