import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSource } from './helpers/load-source.mjs'

const GROUP_ID = -1001234567890
const TOPIC_ID = 17585
const GENERAL_TOPIC_ID = 1
// 现有参数校验 `/^(\d+|\w+)$/` 不接受负号，因此按 chatId 查询只用正数；
// 这是改动前就存在的行为，本次不改变。
const QUERY_CHAT_ID = 1234567890

const supergroup = (overrides = {}) => ({
  id: GROUP_ID,
  type: 'supergroup',
  title: '测试群',
  username: 'test_group',
  ...overrides
})

const privateChat = () => ({ id: 999, type: 'private', first_name: '小明' })

const messageOf = ({ messageThreadId, chat = supergroup() } = {}) => ({
  message_id: 10,
  chat,
  from: { id: 1, first_name: '小明' },
  text: '/whoareyou',
  ...(messageThreadId === undefined ? {} : { message_thread_id: messageThreadId })
})

const expectedChatInfo = (chat) => [
  `Hi ${chat.first_name || chat.title} ${chat.last_name || ''}`,
  `chatId: ${chat.id}`,
  ...(chat.username ? [`userName: ${chat.username}`] : []),
  `chatType: ${chat.type}`
].join('\n')

const createHarness = (options = {}) => {
  const calls = { send: [], getChat: [] }
  const commandHandlers = []
  const bot = {
    command: { sub: (handler) => commandHandlers.push(handler) },
    instance: {
      telegram: {
        getChat: async (target) => {
          calls.getChat.push(target)
          if (options.getChatError) throw options.getChatError
          return options.getChatResult ?? supergroup()
        }
      }
    }
  }
  loadSource('src/modules/get-user-info.ts', {
    '../utils/persistConfig': { entries: { getUserInfo: { test_bot: {} } } },
    '../interface/telegram': { getTelegramBotByAnyBotName: () => bot },
    '../utils/errorMessages': {
      illegalArguments: () => '非法参数文案'
    },
    '../utils/lang': { isNumeric: (value) => /^-?\d+$/.test(String(value ?? '')) }
  })
  const dispatch = async (message, { args = [], commandName = 'whoareyou' } = {}) => {
    assert.equal(commandHandlers.length, 1, '应只注册一个命令处理器')
    await commandHandlers[0]({
      ctx: { chat: message.chat },
      message,
      args,
      commandName,
      currentChat: message.chat,
      currentChatId: message.chat.id,
      sendMessageToCurrentChat: (...params) => calls.send.push(...params)
    })
  }
  return { calls, dispatch }
}

const lastLine = (text) => text.split('\n').at(-1)

test('话题群里对具体话题发送 /whoareyou 时追加当前 topicId', async () => {
  const harness = createHarness()
  await harness.dispatch(messageOf({ messageThreadId: TOPIC_ID }))
  assert.deepEqual(harness.calls.send, [
    '正在查询',
    `${expectedChatInfo(supergroup())}\ntopicId: ${TOPIC_ID}`
  ])
})

test('General 话题显示「无话题 id」提示而不是数字 1', async () => {
  const harness = createHarness()
  await harness.dispatch(messageOf({ messageThreadId: GENERAL_TOPIC_ID }))
  assert.equal(
    lastLine(harness.calls.send.at(-1)),
    'topicId: (General 无话题 id)'
  )
})

test('非话题会话（群 / 私聊）输出逐字保持原样，不出现 topicId', async () => {
  for (const chat of [supergroup(), privateChat()]) {
    const harness = createHarness()
    await harness.dispatch(messageOf({ chat }))
    assert.deepEqual(harness.calls.send, ['正在查询', expectedChatInfo(chat)])
    assert.ok(!harness.calls.send.at(-1).includes('topicId'), chat.type)
  }
})

test('按 chatId 查询其它会话时不追加 topicId', async () => {
  const harness = createHarness()
  await harness.dispatch(messageOf({ messageThreadId: TOPIC_ID }), {
    args: [String(QUERY_CHAT_ID)]
  })
  assert.deepEqual(harness.calls.getChat, [QUERY_CHAT_ID])
  assert.deepEqual(harness.calls.send, ['正在查询', expectedChatInfo(supergroup())])
})

test('按 @username 查询其它会话时不追加 topicId', async () => {
  const harness = createHarness()
  await harness.dispatch(messageOf({ messageThreadId: TOPIC_ID }), {
    args: ['some_group']
  })
  assert.deepEqual(harness.calls.getChat, ['@some_group'])
  assert.ok(!harness.calls.send.at(-1).includes('topicId'))
})

test('非法参数仍返回原有参数错误文案，不发「正在查询」', async () => {
  const harness = createHarness()
  await harness.dispatch(messageOf({ messageThreadId: TOPIC_ID }), {
    args: ['@@@bad@@@']
  })
  assert.deepEqual(harness.calls.send, ['非法参数文案'])
})

test('查询不存在的会话时保持原有提示', async () => {
  const harness = createHarness({
    getChatError: { description: 'Bad Request: chat not found' }
  })
  await harness.dispatch(messageOf(), { args: [String(QUERY_CHAT_ID)] })
  assert.ok(harness.calls.send.some((text) => text.includes('会话不存在')))
})

test('非 whoareyou 命令不响应', async () => {
  const harness = createHarness()
  await harness.dispatch(messageOf({ messageThreadId: TOPIC_ID }), {
    commandName: 'ping'
  })
  assert.deepEqual(harness.calls.send, [])
})
