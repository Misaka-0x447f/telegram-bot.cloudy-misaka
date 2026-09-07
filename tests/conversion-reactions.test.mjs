import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { loadSource } from './helpers/load-source.mjs'

const reaction = loadSource('src/utils/commandReaction.ts')
const errors = loadSource('src/utils/errorMessages.ts')
const sticker = { file_id: 'test-video', is_video: true, is_animated: false,
  width: 512, height: 512, file_size: 20 }
function setup(module, convert = async () => Buffer.from('GIF89a')) {
  const calls = []
  const listeners = {}
  const telegram = {
    callApi: async (_, data) => { calls.push({ type: 'reaction', ...data }) },
    getFileLink: async () => 'test-download',
    sendChatAction: async () => {},
    sendPhoto: async () => { calls.push({ type: 'photo' }) },
    sendDocument: async (_, file, extra) => { calls.push({ type: 'document', file, extra }) }
  }
  const worker = { instance: { telegram },
    command: { sub: (fn) => { listeners.command = fn } },
    message: { sub: (fn) => { listeners.message = fn } } }
  loadSource(`src/modules/${module}.ts`, {
    '../interface/telegram': { getTelegramBotByAnyBotName: () => worker, exportBot: { test: worker } },
    '../utils/persistConfig': { entries: { fetchSticker: { test: {} } } },
    '../utils/errorMessages': errors,
    '../utils/commandReaction': reaction,
    '../utils/file': { downloadStream: () => Readable.from([Buffer.from('sample')]) },
    execa: async (_, args) => { calls.push({ type: 'ffmpeg', args }) },
    fs: { promises: { writeFile: async () => {}, readFile: convert, rm: async () => {} } }
  })
  const payload = { currentChatId: 1, message: { message_id: 10, from: { id: 100 }, reply_to_message: { sticker } },
    sendMessageToCurrentChat: async (text) => { calls.push({ type: 'text', text }) } }
  return { calls, listeners, payload }
}

test('imgconv rejects invalid parameters between adding and clearing eyes', async () => {
  const h = setup('imgconv')
  await h.listeners.command({ ...h.payload, commandName: 'imgconv', args: [] })
  assert.deepEqual(h.calls.map((c) => c.type), ['reaction', 'text', 'reaction'])
  assert.deepEqual(h.calls.at(-1).reaction, [])
})

test('imgconv finishes its existing conversion and upload before clearing eyes', async () => {
  let converted = 0
  const gif = Buffer.from('GIF89a-test-output')
  const h = setup('imgconv', async () => { converted++; return gif })
  await h.listeners.command({ ...h.payload, commandName: 'imgconv', args: ['gif'] })
  assert.equal(converted, 1)
  const doc = h.calls.find((c) => c.type === 'document')
  assert.equal(doc.file.source, gif)
  assert.equal(doc.file.filename, 'converted.gif')
  assert.deepEqual(doc.extra, { reply_to_message_id: 10 })
  const ffmpeg = h.calls.find((c) => c.type === 'ffmpeg')
  assert.ok(ffmpeg.args.includes('-vf'))
  assert.equal(h.calls[0].reaction[0].emoji, '👀')
  assert.deepEqual(h.calls.at(-1).reaction, [])
})

test('imgconv removes eyes when conversion fails', async () => {
  const h = setup('imgconv', async () => { throw new Error('test conversion failed') })
  await h.listeners.command({ ...h.payload, commandName: 'imgconv', args: ['gif'] })
  assert.ok(!h.calls.some((c) => c.type === 'document'))
  assert.deepEqual(h.calls.at(-1).reaction, [])
})

test('fetch_sticker waits for sending and clears eyes after an invalid reply', async () => {
  const h = setup('fetch-sticker')
  await h.listeners.command({ ...h.payload, commandName: 'fetch_sticker' })
  assert.deepEqual(h.calls.map((c) => c.type), ['reaction', 'photo', 'reaction'])
  h.calls.length = 0
  await h.listeners.command({ ...h.payload, commandName: 'fetch_sticker', message: { message_id: 10, reply_to_message: { text: 'invalid' } } })
  assert.deepEqual(h.calls.map((c) => c.type), ['reaction', 'text', 'reaction'])
})

test('fetch_sticker reverse replies react to the command, not the sticker', async () => {
  const h = setup('fetch-sticker')
  await h.listeners.message({ ...h.payload, replyToCommand: 'fetch_sticker', isCommand: false,
    message: { message_id: 11, sticker, reply_to_message: { message_id: 10 } } })
  assert.deepEqual(h.calls.filter((c) => c.type === 'reaction').map((c) => c.message_id), [10, 10])
})
