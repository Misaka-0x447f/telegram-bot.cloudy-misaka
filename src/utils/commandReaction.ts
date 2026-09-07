import { Telegram } from 'telegraf'

type ReactionClient = Pick<Telegram, 'callApi'>
type ReactionState = { users: number; pending: Promise<void> }
const active = new WeakMap<ReactionClient, Map<string, ReactionState>>()

// Multiple replies can reuse one command message. Serialize reaction changes
// and only clear the bot's reaction after the last associated task finishes.
export const withProcessingReaction = async <T>(
  telegram: ReactionClient,
  chatId: number,
  commandMessageId: number | undefined,
  task: () => T | Promise<T>
): Promise<T> => {
  if (commandMessageId === undefined) return await task()
  let messages = active.get(telegram)
  if (!messages) {
    messages = new Map()
    active.set(telegram, messages)
  }
  const key = `${chatId}:${commandMessageId}`
  const state = messages.get(key) || { users: 0, pending: Promise.resolve() }
  messages.set(key, state)
  const update = (processing: boolean) => {
    state.pending = state.pending.then(async () => {
      try {
        await telegram.callApi('setMessageReaction', {
          chat_id: chatId,
          message_id: commandMessageId,
          reaction: processing ? [{ type: 'emoji', emoji: '👀' }] : []
        })
      } catch {
        // Reactions may be disabled or the message deleted. Conversion must
        // still work; raw API errors can also contain credentials.
      }
    })
    return state.pending
  }
  state.users += 1
  if (state.users === 1) update(true)
  try {
    await state.pending
    return await task()
  } finally {
    state.users -= 1
    if (state.users === 0) {
      const clearing = update(false)
      await clearing
      if (state.users === 0 && state.pending === clearing) messages.delete(key)
    }
  }
}
