export const telegramHTMLEscape = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// 论坛超级群的 General 话题在 incoming update 上以 message_thread_id=1 表示。它不是可寻址
// 的真实话题（Bot API 拒绝以 message_thread_id=1 发送），因此统一按「无话题」处理。
export const GENERAL_TOPIC_ID = 1

// 依赖里的 Message 类型早于论坛话题（2022），没有该字段；运行时存在，故按结构读取。
// 非数字（缺失、null、字符串等）一律视为无话题。
export const getMessageTopicId = (message: unknown): number | undefined => {
  const topicId = (message as { message_thread_id?: unknown } | null | undefined)?.message_thread_id
  return typeof topicId === 'number' ? topicId : undefined
}

// 可作为发送目标的话题 id；General 与无话题都返回 undefined，调用方据此决定是否附加参数。
export const getReplyTopicId = (message: unknown): number | undefined => {
  const topicId = getMessageTopicId(message)
  return topicId === undefined || topicId === GENERAL_TOPIC_ID ? undefined : topicId
}
