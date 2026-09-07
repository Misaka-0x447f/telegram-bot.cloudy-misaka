import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))

// Load only the module under test; importing the bot interface would start
// real polling and load deployment credentials.
function loadSource(relativePath, dependencies = {}) {
  const filename = path.resolve(directory, '..', relativePath)
  const localRequire = createRequire(filename)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : localRequire(name),
    module,
    module.exports
  )
  return module.exports
}

const errorMessages = loadSource('src/utils/errorMessages.ts')
const sourceSticker = {
  file_id: 'test-file-id', is_video: true, is_animated: false,
  width: 512, height: 512, file_size: 46188
}

function setup(overrides = {}) {
  const callbacks = {}
  const replies = []
  const documents = []
  const downloaded = []
  const output = Buffer.from('GIF89a-test-output')
  class StickerGifError extends Error {}
  const telegram = {
    getFileLink: async () => 'https://example.invalid/sample.webm',
    sendChatAction: async () => {},
    sendDocument: async (...args) => { documents.push(args) },
    ...overrides.telegram
  }
  const worker = {
    instance: { telegram },
    command: { sub: (fn) => { callbacks.command = fn } },
    message: { sub: (fn) => { callbacks.message = fn } }
  }
  loadSource('src/modules/fetch-sticker-gif.ts', {
    '../interface/telegram': { getTelegramBotByAnyBotName: () => worker },
    '../utils/persistConfig': { entries: { fetchSticker: { test: {} } } },
    '../utils/errorMessages': errorMessages,
    '../utils/stickerGif': {
      StickerGifError,
      MAX_STICKER_INPUT_BYTES: 1024 * 1024,
      downloadVideoSticker: async (url) => { downloaded.push(url); return Buffer.from('webm') },
      convertVideoStickerToGif: overrides.convert || (async () => output)
    }
  })
  const payload = (source = { sticker: sourceSticker }) => ({
    commandName: 'fetch_sticker_gif', currentChatId: 123,
    message: { message_id: 42, reply_to_message: source },
    sendMessageToCurrentChat: overrides.reply || (async (text) => { replies.push(text) })
  })
  return { callbacks, replies, documents, downloaded, output, payload }
}

test('replying to a video sticker sends the named GIF unchanged as a document', async () => {
  const h = setup()
  await h.callbacks.command(h.payload())
  assert.equal(h.documents.length, 1)
  const [chat, document, extra] = h.documents[0]
  assert.equal(chat, 123)
  assert.equal(document.source, h.output)
  assert.equal(document.filename, 'sticker.gif')
  assert.equal(extra.disable_content_type_detection, true)
  assert.equal(extra.reply_to_message_id, 42)
  assert.equal(h.replies.length, 0)
})

test('a sticker replying to the command is also accepted', async () => {
  const h = setup()
  await h.callbacks.message({ ...h.payload(), isCommand: false,
    replyToCommand: 'fetch_sticker_gif', message: { message_id: 43, sticker: sourceSticker } })
  assert.equal(h.documents.length, 1)
  assert.equal(h.documents[0][2].reply_to_message_id, 43)
})

test('unrelated commands and command messages do not trigger conversion', async () => {
  const h = setup()
  await h.callbacks.command({ ...h.payload(), commandName: 'fetch_sticker' })
  await h.callbacks.message({ ...h.payload(), replyToCommand: 'fetch_sticker_gif', isCommand: true })
  assert.equal(h.downloaded.length, 0)
  assert.equal(h.replies.length, 0)
})

test('missing replies, non-stickers, TGS, static and oversized stickers get one error', async () => {
  for (const source of [null, { animation: {} },
    { sticker: { ...sourceSticker, is_video: false, is_animated: true } },
    { sticker: { ...sourceSticker, is_video: false } },
    { sticker: { ...sourceSticker, width: 513 } },
    { sticker: { ...sourceSticker, file_size: 1024 * 1024 + 1 } }]) {
    const h = setup()
    await h.callbacks.command(h.payload(source))
    assert.equal(h.replies.length, 1)
    assert.equal(h.downloaded.length, 0)
    assert.equal(h.documents.length, 0)
  }
})

test('overlapping requests are rejected without releasing the active slot', async () => {
  let finish
  const pending = new Promise((resolve) => { finish = resolve })
  const h = setup({ convert: () => pending })
  const first = h.callbacks.command(h.payload())
  await h.callbacks.command(h.payload())
  await h.callbacks.command(h.payload())
  assert.equal(h.replies.filter((text) => text.includes('正在转换')).length, 2)
  finish(Buffer.from('GIF89a'))
  await first
  await h.callbacks.command(h.payload())
  assert.equal(h.documents.length, 2)
})

test('conversion failures are sanitized and release the slot for retry', async () => {
  let attempts = 0
  const h = setup({ convert: async () => {
    if (++attempts === 1) throw new Error('PRIVATE_DOWNLOAD_URL')
    return Buffer.from('GIF89a')
  } })
  await h.callbacks.command(h.payload())
  assert.equal(h.documents.length, 0)
  assert.equal(h.replies.length, 1)
  assert.ok(!h.replies[0].includes('PRIVATE_DOWNLOAD_URL'))
  await h.callbacks.command(h.payload())
  assert.equal(h.documents.length, 1)
})

test('failed uploads and failed error replies do not escape the event listener', async () => {
  const h = setup({
    telegram: { sendDocument: async () => { throw new Error('PRIVATE_API_ERROR') } },
    reply: async () => { throw new Error('chat unavailable') }
  })
  await assert.doesNotReject(h.callbacks.command(h.payload()))
  await assert.doesNotReject(h.callbacks.command(h.payload(null)))
})

test('download limit is enforced on received bytes, even without file_size metadata', async () => {
  const stream = Readable.from([Buffer.alloc(1024 * 1024), Buffer.alloc(1)])
  const utils = loadSource('src/utils/stickerGif.ts', { './file': { downloadStream: () => stream } })
  await assert.rejects(utils.downloadVideoSticker('test'), /超过 1 MiB/)
  assert.equal(stream.destroyed, true)
})

test('successful downloads preserve the original bytes and close the stream', async () => {
  const stream = Readable.from([Buffer.from('web'), Buffer.from('m')])
  const utils = loadSource('src/utils/stickerGif.ts', { './file': { downloadStream: () => stream } })
  assert.deepEqual(await utils.downloadVideoSticker('test'), Buffer.from('webm'))
  assert.equal(stream.destroyed, true)
})
