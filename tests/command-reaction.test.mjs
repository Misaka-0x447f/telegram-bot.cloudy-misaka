import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSource } from './helpers/load-source.mjs'

const { withProcessingReaction: run } = loadSource('src/utils/commandReaction.ts')
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('eyes finish being set before work starts and remain until work resolves', async () => {
  const setting = deferred()
  const work = deferred()
  const calls = []
  const telegram = { callApi: async (method, data) => {
    calls.push({ method, ...data })
    if (data.reaction.length) await setting.promise
  } }
  let started = false
  const job = run(telegram, 1, 2, async () => { started = true; return await work.promise })
  await tick()
  assert.equal(started, false)
  setting.resolve()
  await tick()
  assert.equal(started, true)
  assert.equal(calls.length, 1)
  work.resolve('result')
  assert.equal(await job, 'result')
  assert.deepEqual(calls, [
    { method: 'setMessageReaction', chat_id: 1, message_id: 2, reaction: [{ type: 'emoji', emoji: '👀' }] },
    { method: 'setMessageReaction', chat_id: 1, message_id: 2, reaction: [] }
  ])
})

test('failure still clears eyes and propagates the original task error', async () => {
  const calls = []
  const telegram = { callApi: async (_, data) => calls.push(data.reaction) }
  const error = new Error('conversion failed')
  await assert.rejects(run(telegram, 1, 2, () => { throw error }), (e) => e === error)
  assert.deepEqual(calls, [[{ type: 'emoji', emoji: '👀' }], []])
})

test('disabled reactions do not prevent conversion or turn success into failure', async () => {
  const telegram = { callApi: async () => { throw new Error('REACTION_INVALID') } }
  assert.equal(await run(telegram, 1, 2, () => 42), 42)
})

test('overlapping jobs on the same command keep eyes until the last completion', async () => {
  const calls = []
  const telegram = { callApi: async (_, data) => calls.push(data.reaction) }
  const first = deferred()
  const second = deferred()
  const a = run(telegram, 1, 2, () => first.promise)
  const b = run(telegram, 1, 2, () => second.promise)
  await tick()
  assert.equal(calls.length, 1)
  first.resolve()
  await a
  assert.equal(calls.length, 1)
  second.resolve()
  await b
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], [])
})

test('a new request during removal waits for removal and restores eyes in order', async () => {
  const calls = []
  const removing = deferred()
  let clearCount = 0
  const telegram = { callApi: async (_, data) => {
    calls.push(data.reaction)
    if (!data.reaction.length && ++clearCount === 1) await removing.promise
  } }
  const first = run(telegram, 1, 2, () => 'first')
  await tick()
  let started = false
  const second = run(telegram, 1, 2, () => { started = true; return 'second' })
  await tick()
  assert.equal(started, false)
  removing.resolve()
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second'])
  assert.deepEqual(calls.map((r) => r.length), [1, 0, 1, 0])
})

test('missing command identifiers skip reactions and still perform the task', async () => {
  const telegram = { callApi: () => { throw new Error('must not be called') } }
  assert.equal(await run(telegram, 1, undefined, () => 'done'), 'done')
})
