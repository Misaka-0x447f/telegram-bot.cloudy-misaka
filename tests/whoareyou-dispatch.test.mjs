import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSource } from './helpers/load-source.mjs'

// 用真实的 topic 工具模块，避免 mock 与实现（General=1 等规则）漂移。
const telegramUtils = loadSource('src/utils/telegram.ts')

// 端到端覆盖 src/interface/telegram.ts 的分派：真实 Telegram update（带 message_thread_id）
// -> commonProperties.message -> command 事件 -> get-user-info 处理器 -> 发消息。
// 独立测试只覆盖后两者；这里补上生产者一侧的接线，避免 message 从载荷里丢失时静默失效。

const GROUP_ID = -1001234567890
const TOPIC_ID = 17585

class FakeTelegraf {
  constructor (token) {
    this.token = token
    this.options = {}
    this.handlers = {}
    this.telegram = {
      getMe: async () => ({ username: 'test_bot' }),
      sendMessage: async (...params) => { FakeTelegraf.sent.push(params); return {} },
      forwardMessage: async (...params) => { FakeTelegraf.forwarded.push(params); return {} }
    }
    FakeTelegraf.instances.push(this)
  }

  use () {}

  on (event, handler) { this.handlers[event] = handler }

  startPolling () {}
}
FakeTelegraf.instances = []
FakeTelegraf.sent = []
FakeTelegraf.forwarded = []

const createTypedEventFactory = (pending) => () => {
  const callbacks = []
  return {
    sub: (callback) => { callbacks.push(callback) },
    unsub: (callback) => {
      const index = callbacks.indexOf(callback)
      if (index !== -1) callbacks.splice(index, 1)
    },
    dispatch: (payload) => {
      pending.push(...callbacks.map((callback) => callback(payload || {})))
    },
    once: (callback) => { callbacks.push(callback) }
  }
}

const createHarness = () => {
  FakeTelegraf.instances = []
  FakeTelegraf.sent = []
  FakeTelegraf.forwarded = []
  const pending = []

  const { exportBot } = loadSource('src/interface/telegram.ts', {
    telegraf: { Telegraf: FakeTelegraf },
    'telegraf-throttler': () => (_ctx, next) => next(),
    bottleneck: { strategy: { OVERFLOW: 'OVERFLOW' } },
    'promise-retry': (action) => action(() => { throw new Error('unexpected retry') }),
    'lodash-es': {
      defaultTo: (value, fallback) => (value === undefined || value === null ? fallback : value)
    },
    'https-proxy-agent': class HttpsProxyAgent {},
    'socks-proxy-agent': { SocksProxyAgent: class SocksProxyAgent {} },
    '../utils/TypedEvent': createTypedEventFactory(pending),
    '../utils/persistConfig': {
      entries: { tokenTelegram: [{ name: 'test_bot', token: 'test-token' }] }
    },
    '../utils/lang': { sleep: async () => {} },
    '../utils/telemetry': async () => {},
    '../utils/actionFunctions': { runActionFunctions: (text) => text },
    '../utils/telegram': telegramUtils
  })

  const bot = exportBot.test_bot
  loadSource('src/modules/get-user-info.ts', {
    '../utils/persistConfig': { entries: { getUserInfo: { test_bot: {} } } },
    '../interface/telegram': { getTelegramBotByAnyBotName: () => bot },
    '../utils/errorMessages': { illegalArguments: () => '非法参数文案' },
    '../utils/lang': { isNumeric: (value) => /^-?\d+$/.test(String(value ?? '')) },
    '../utils/telegram': telegramUtils
  })

  const dispatch = async (message) => {
    const before = pending.length
    // 真实 Telegraf ctx 有 chat 快捷属性；get-user-info 依赖它做会话判空。
    FakeTelegraf.instances[0].handlers.message({ update: { message }, chat: message.chat })
    await Promise.all(pending.splice(before))
  }

  return { sent: FakeTelegraf.sent, forwarded: FakeTelegraf.forwarded, dispatch, bot }
}

const rawMessage = ({ messageThreadId, chat } = {}) => ({
  message_id: 1,
  chat: chat ?? {
    id: GROUP_ID,
    type: 'supergroup',
    title: '测试群',
    username: 'test_group'
  },
  from: { id: 7, first_name: '小明' },
  text: '/whoareyou',
  ...(messageThreadId === undefined ? {} : { message_thread_id: messageThreadId })
})

const baseLines = 'Hi 测试群 \nchatId: -1001234567890\nuserName: test_group\nchatType: supergroup'

test('真实 update 分派：话题内 /whoareyou 端到端追加 topicId，回复留在该话题', async () => {
  const harness = createHarness()
  await harness.dispatch(rawMessage({ messageThreadId: TOPIC_ID }))
  assert.deepEqual(harness.sent, [
    [GROUP_ID, '正在查询', { message_thread_id: TOPIC_ID }],
    [GROUP_ID, `${baseLines}\ntopicId: ${TOPIC_ID}`, { message_thread_id: TOPIC_ID }]
  ])
})

test('真实 update 分派：General 话题显示提示，且不附加 message_thread_id', async () => {
  const harness = createHarness()
  await harness.dispatch(rawMessage({ messageThreadId: 1 }))
  assert.deepEqual(harness.sent, [
    [GROUP_ID, '正在查询'],
    [GROUP_ID, `${baseLines}\ntopicId: (General 无话题 id)`]
  ])
})

test('真实 update 分派：非话题消息端到端保持原样，不附加 message_thread_id', async () => {
  const harness = createHarness()
  await harness.dispatch(rawMessage())
  assert.deepEqual(harness.sent, [[GROUP_ID, '正在查询'], [GROUP_ID, baseLines]])
})

test('sendMessageToCurrentChat 保留调用方 extra，并追加触发话题 id', async () => {
  const harness = createHarness()
  let payload
  harness.bot.message.sub((p) => { payload = p })
  await harness.dispatch(rawMessage({ messageThreadId: TOPIC_ID }))
  harness.sent.length = 0
  await payload.sendMessageToCurrentChat('正文', { parse_mode: 'MarkdownV2' })
  assert.deepEqual(harness.sent, [
    [GROUP_ID, '正文', { parse_mode: 'MarkdownV2', message_thread_id: TOPIC_ID }]
  ])
})

test('runActions：发往当前会话留在话题，发往其它 dest 不附加 thread', async () => {
  const harness = createHarness()
  const otherChatId = -100999
  await harness.bot.runActions([
    [
      { type: 'message', text: '回当前会话' },
      { type: 'message', text: '回别处', dest: otherChatId }
    ]
  ], { defaultChatId: GROUP_ID, message: rawMessage({ messageThreadId: TOPIC_ID }) })
  assert.deepEqual(harness.sent, [
    [GROUP_ID, '回当前会话', { message_thread_id: TOPIC_ID }],
    [otherChatId, '回别处', undefined]
  ])
})

test('runActions：未传触发消息（worker 场景）不附加 thread', async () => {
  const harness = createHarness()
  await harness.bot.runActions([[{ type: 'message', text: '推送' }]], { defaultChatId: GROUP_ID })
  assert.deepEqual(harness.sent, [[GROUP_ID, '推送', undefined]])
})

test('runActions：General 话题不附加 thread', async () => {
  const harness = createHarness()
  await harness.bot.runActions([[{ type: 'message', text: '回当前会话' }]], {
    defaultChatId: GROUP_ID,
    message: rawMessage({ messageThreadId: 1 })
  })
  assert.deepEqual(harness.sent, [[GROUP_ID, '回当前会话', undefined]])
})

test('runActions：step.dest 等于当前会话时也跟随话题，并保留 step.extra', async () => {
  const harness = createHarness()
  await harness.bot.runActions([[
    { type: 'message', text: '同会话', dest: GROUP_ID, extra: { parse_mode: 'HTML' } }
  ]], { defaultChatId: GROUP_ID, message: rawMessage({ messageThreadId: TOPIC_ID }) })
  assert.deepEqual(harness.sent, [
    [GROUP_ID, '同会话', { parse_mode: 'HTML', message_thread_id: TOPIC_ID }]
  ])
})

test('runActions：messageByForward 发往当前会话时也带话题 id', async () => {
  const harness = createHarness()
  await harness.bot.runActions([[
    { type: 'messageByForward', source: GROUP_ID, messageId: 42 }
  ]], { defaultChatId: GROUP_ID, message: rawMessage({ messageThreadId: TOPIC_ID }) })
  assert.deepEqual(harness.forwarded, [
    [GROUP_ID, GROUP_ID, 42, { message_thread_id: TOPIC_ID }]
  ])
})
