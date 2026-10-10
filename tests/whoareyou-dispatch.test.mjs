import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSource } from './helpers/load-source.mjs'

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
    '../utils/actionFunctions': { runActionFunctions: (text) => text }
  })

  const bot = exportBot.test_bot
  loadSource('src/modules/get-user-info.ts', {
    '../utils/persistConfig': { entries: { getUserInfo: { test_bot: {} } } },
    '../interface/telegram': { getTelegramBotByAnyBotName: () => bot },
    '../utils/errorMessages': { illegalArguments: () => '非法参数文案' },
    '../utils/lang': { isNumeric: (value) => /^-?\d+$/.test(String(value ?? '')) }
  })

  const dispatch = async (message) => {
    const before = pending.length
    // 真实 Telegraf ctx 有 chat 快捷属性；get-user-info 依赖它做会话判空。
    FakeTelegraf.instances[0].handlers.message({ update: { message }, chat: message.chat })
    await Promise.all(pending.splice(before))
  }

  return { sent: FakeTelegraf.sent, dispatch }
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

test('真实 update 分派：话题内 /whoareyou 端到端追加 topicId', async () => {
  const harness = createHarness()
  await harness.dispatch(rawMessage({ messageThreadId: TOPIC_ID }))
  assert.deepEqual(harness.sent, [
    [GROUP_ID, '正在查询'],
    [GROUP_ID, `${baseLines}\ntopicId: ${TOPIC_ID}`]
  ])
})

test('真实 update 分派：General 话题端到端显示无话题 id 提示', async () => {
  const harness = createHarness()
  await harness.dispatch(rawMessage({ messageThreadId: 1 }))
  assert.equal(harness.sent.at(-1)[1], `${baseLines}\ntopicId: (General 无话题 id)`)
})

test('真实 update 分派：非话题消息端到端保持原样', async () => {
  const harness = createHarness()
  await harness.dispatch(rawMessage())
  assert.deepEqual(harness.sent, [[GROUP_ID, '正在查询'], [GROUP_ID, baseLines]])
})
