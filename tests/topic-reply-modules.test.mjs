import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSource } from './helpers/load-source.mjs'

// 验证 /ping、/start 把触发消息交给 runActions，从而让后者能把回复留在话题里。
// runActions 本身的话题逻辑由 whoareyou-dispatch.test.mjs 经真实 telegram.ts 覆盖。

const GROUP_ID = -1001234567890
const TOPIC_ID = 17585

const supergroupMessage = (text) => ({
  message_id: 11,
  chat: { id: GROUP_ID, type: 'supergroup', title: '测试群', username: 'test_group' },
  from: { id: 7, first_name: '小明' },
  text,
  message_thread_id: TOPIC_ID
})

const createBot = () => {
  const calls = { runActions: [] }
  const handlers = { command: [], message: [] }
  const bot = {
    username: 'test_bot',
    command: { sub: (handler) => handlers.command.push(handler) },
    message: { sub: (handler) => handlers.message.push(handler) },
    runActions: async (actions, options, params) => {
      calls.runActions.push({ actions, options, params })
    }
  }
  return { bot, calls, handlers }
}

test('/start 把触发消息传给 runActions（用于跟随话题）', async () => {
  const { bot, calls, handlers } = createBot()
  loadSource('src/modules/start.ts', {
    '../utils/persistConfig': {
      entries: { start: { test_bot: { actions: [[{ type: 'message', text: 'hi' }]] } } }
    },
    '../interface/telegram': { getTelegramBotByAnyBotName: () => bot }
  })
  const message = supergroupMessage('/start')
  await handlers.command[0]({ ctx: { message }, commandName: 'start', message })
  assert.equal(calls.runActions.length, 1)
  assert.equal(calls.runActions[0].options.message, message)
  assert.equal(calls.runActions[0].options.defaultChatId, GROUP_ID)
})

test('/ping 把触发消息传给 runActions（用于跟随话题）', async () => {
  const { bot, calls, handlers } = createBot()
  loadSource('src/modules/ping.ts', {
    '../utils/persistConfig': {
      entries: { ping: { test_bot: { actions: [[{ type: 'message', text: 'pong' }]] } } }
    },
    '../interface/telegram': { getTelegramBotByAnyBotName: () => bot }
  })
  const message = supergroupMessage('/ping@test_bot')
  await handlers.message[0]({ message, currentChat: message.chat })
  assert.equal(calls.runActions.length, 1)
  assert.equal(calls.runActions[0].options.message, message)
  assert.equal(calls.runActions[0].options.defaultChatId, GROUP_ID)
})

test('非 /ping 消息不触发 runActions', async () => {
  const { bot, calls, handlers } = createBot()
  loadSource('src/modules/ping.ts', {
    '../utils/persistConfig': {
      entries: { ping: { test_bot: { actions: [[{ type: 'message', text: 'pong' }]] } } }
    },
    '../interface/telegram': { getTelegramBotByAnyBotName: () => bot }
  })
  const message = supergroupMessage('普通消息')
  await handlers.message[0]({ message, currentChat: message.chat })
  assert.equal(calls.runActions.length, 0)
})
