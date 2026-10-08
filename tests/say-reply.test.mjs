import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSource } from './helpers/load-source.mjs'

const adminId = 1234
const targetId = -1005678
const targetMessageId = 91

const createHarness = (overrides = {}) => {
  const calls = { copy: [], send: [], forward: [], telemetry: [], spam: [], photos: [] }
  const messageHandlers = []
  const commandHandlers = []
  const config = {
    adminChatIdsCanReceiveReply: true,
    adminChatIds: [adminId],
    list: [],
    ...overrides
  }
  const bot = {
    username: 'test_reply_bot',
    message: { sub: (handler) => messageHandlers.push(handler) },
    command: { sub: (handler) => commandHandlers.push(handler) },
    instance: {
      telegram: {
        getUserProfilePhotos: async (...args) => {
          calls.photos.push(args)
          return { total_count: 1 }
        }
      }
    },
    sendMessage: async (...args) => { calls.send.push(args) },
    forwardMessage: async (...args) => { calls.forward.push(args) }
  }
  let copyError
  const telegram = {
    sendCopy: async (...args) => {
      calls.copy.push(args)
      if (copyError) throw copyError
      return { message_id: 900 }
    }
  }
  loadSource('src/modules/say.ts', {
    '../utils/persistConfig': { entries: { say: { test: config } } },
    '../interface/telegram': { getTelegramBotByAnyBotName: () => bot },
    '../utils/errorMessages': {
      illegalReplyMessageCount: () => '回复参数错误',
      illegalArguments: () => '参数错误'
    },
    '../utils/lang': {
      isNumeric: (value) => /^-?\d+$/.test(value ?? ''),
      stringify: (value) => value instanceof Error ? value.message : JSON.stringify(value),
      tryCatchReturn: (action, fallback) => {
        try { return action() } catch (error) { return fallback(error) }
      }
    },
    '../utils/telemetry': async (...args) => { calls.telemetry.push(args) },
    '../utils/telemetrySpam': { recordSpam: (...args) => { calls.spam.push(args) } },
    'lodash-es': {
      isUndefined: (value) => value === undefined,
      omitBy: (value, predicate) => Object.fromEntries(
        Object.entries(value).filter(([, field]) => !predicate(field))
      )
    }
  })
  const dispatch = async (message, command) => {
    const payload = {
      message,
      isCommand: Boolean(command),
      currentChat: message.chat,
      currentChatId: message.chat.id,
      ctx: { message, telegram },
      sendMessageToCurrentChat: (...args) => bot.sendMessage(message.chat.id, ...args),
      ...command
    }
    const handlers = command ? [...commandHandlers, ...messageHandlers] : messageHandlers
    await Promise.all(handlers.map((handler) => handler(payload)))
  }
  return { calls, dispatch, failCopy: (error) => { copyError = error } }
}

const privateReply = (yamlText = `chatId: ${targetId}\nmessageId: ${targetMessageId}`, chatId = adminId) => ({
  message_id: 44,
  chat: { id: chatId, type: 'private', first_name: 'Admin' },
  from: { id: chatId, first_name: 'Admin' },
  text: '回复正文',
  reply_to_message: {
    message_id: 43,
    text: yamlText,
    from: { username: 'test_reply_bot' }
  }
})

const assertSilent = (calls) => {
  for (const [name, values] of Object.entries(calls)) {
    assert.equal(values.length, 0, `${name} should not run`)
  }
}

test('管理员私聊回复 YAML 信息时发送当前消息到原聊天并关联原消息', async () => {
  const harness = createHarness()
  const message = privateReply()
  await harness.dispatch(message)
  assert.deepEqual(harness.calls.copy, [[targetId, message, { reply_to_message_id: targetMessageId }]])
  assert.equal(harness.calls.photos.length, 0)
  assert.equal(harness.calls.spam.length, 0)
  assert.equal(harness.calls.telemetry.length, 0)
})

test('YAML ID 接受数字与数字字符串', async () => {
  for (const yamlText of [
    `chatId: ${targetId}\nmessageId: ${targetMessageId}`,
    `chatId: '${targetId}'\nmessageId: '${targetMessageId}'`,
    'chatId: 5678\nmessageId: 1'
  ]) {
    const harness = createHarness()
    const message = privateReply(yamlText)
    await harness.dispatch(message)
    assert.equal(harness.calls.copy.length, 1, yamlText)
    assert.equal(typeof harness.calls.copy[0][0], 'number')
    assert.equal(typeof harness.calls.copy[0][2].reply_to_message_id, 'number')
  }
})

test('普通私聊、伪造路由信息和管理员未回复消息均保持静默', async () => {
  for (const message of [
    privateReply(undefined, 9999),
    { ...privateReply(undefined, 9999), reply_to_message: undefined, text: 'VPN 广告 https://example.com' },
    { ...privateReply(), reply_to_message: undefined }
  ]) {
    const harness = createHarness()
    await harness.dispatch(message)
    assertSilent(harness.calls)
  }
})

test('管理员名单缺失、为空或功能关闭时不发送', async () => {
  for (const config of [
    { adminChatIds: undefined },
    { adminChatIds: [] },
    { adminChatIdsCanReceiveReply: false }
  ]) {
    const harness = createHarness(config)
    await harness.dispatch(privateReply())
    assertSilent(harness.calls)
  }
})

test('无效 YAML、非对象和非法 ID 不发送消息', async () => {
  for (const yamlText of [
    'chatId: [', 'plain text', 'null', '[]', '{}',
    'chatId: 1', 'messageId: 1',
    'chatId: 0\nmessageId: 1',
    'chatId: 1.5\nmessageId: 1',
    'chatId: 9007199254740992\nmessageId: 1',
    "chatId: '123junk'\nmessageId: 1",
    'chatId: true\nmessageId: 1',
    'chatId: 123\nmessageId: 0',
    'chatId: 123\nmessageId: -1',
    'chatId: 123\nmessageId: 1.5',
    'chatId: 123\nmessageId: 9007199254740992',
    "chatId: 123\nmessageId: '1junk'"
  ]) {
    const harness = createHarness()
    await harness.dispatch(privateReply(yamlText))
    assert.equal(harness.calls.copy.length, 0, yamlText)
    assert.equal(harness.calls.photos.length, 0, yamlText)
    assert.equal(harness.calls.spam.length, 0, yamlText)
  }
})

test('回复发送失败时遥测并用中文反馈，不抛出原始发送异常', async () => {
  const harness = createHarness()
  harness.failCopy(new Error('mock sendCopy failure'))
  await assert.doesNotReject(harness.dispatch(privateReply()))
  assert.equal(harness.calls.copy.length, 1)
  assert.equal(harness.calls.telemetry.length, 1)
  assert.equal(harness.calls.telemetry[0][0], 'say.ts/reply')
  assert.ok(harness.calls.send.some(([chatId, text]) => chatId === adminId && /失败/.test(text)))
})

test('群里回复机器人仍转发给管理员', async () => {
  const harness = createHarness()
  const message = {
    ...privateReply(),
    chat: { id: -100111, type: 'supergroup', title: 'Test group' },
    from: { id: 9999, first_name: 'User' }
  }
  await harness.dispatch(message)
  assert.deepEqual(harness.calls.forward, [[adminId, message.chat.id, message.message_id]])
  assert.equal(harness.calls.copy.length, 0)
  assert.equal(harness.calls.telemetry.length, 0)
})

test('/say 命令继续支持管理员指定目标并复制被回复消息', async () => {
  const harness = createHarness()
  const message = privateReply()
  await harness.dispatch(message, { commandName: 'say', args: [String(targetId)] })
  assert.deepEqual(harness.calls.copy, [[String(targetId), message.reply_to_message, {}]])
})


test('/sayTarget 只设置目标，随后的 /say 只发送被回复的正文', async () => {
  const harness = createHarness()
  const targetCommand = { ...privateReply(), text: '/sayTarget' }
  await harness.dispatch(targetCommand, { commandName: 'sayTarget', args: [] })
  assert.equal(harness.calls.copy.length, 0)
  assert.ok(harness.calls.send.some(([chatId, text]) => chatId === adminId && /成功/.test(text)))
  const content = { message_id: 45, text: '准备发送的正文' }
  const sendCommand = { ...privateReply(), text: '/say', reply_to_message: content }
  await harness.dispatch(sendCommand, { commandName: 'say', args: [''] })
  assert.deepEqual(harness.calls.copy, [[targetId, content, { reply_to_message_id: targetMessageId }]])
})
