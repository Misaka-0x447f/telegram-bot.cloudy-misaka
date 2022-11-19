export interface ParamsDefinition {
  argumentList?: Array<{ name: string; acceptable: string, optional?: true }>
  replyMessageType?: string
}

const getHelpMessage = (params: ParamsDefinition) => {
  const content = []
  if (params.argumentList?.length) {
    const maxLength = params.argumentList.reduce((acc, cur) => {
      return Math.max(cur.name.length, acc)
    }, 0)
    content.push('该命令需要以下参数：')
    params.argumentList.forEach((el) => {
      content.push(`[${el.name}]${el.optional ? '?' : ''}`.padEnd(maxLength + 5).concat(el.acceptable))
    })
    if (params.argumentList.some(el => el.optional)) content.push('其中带有 ? 标记的为可选参数。')
  }
  if (params.replyMessageType) {
    content.push(`该命令需要回复 1 条消息，用于指定${params.replyMessageType}`)
  }
  return content.join('\n')
}

export default {
  illegalArgumentCount: (expected: string | number, actual: string | number, params: ParamsDefinition) =>
    `不合法的参数。需要 ${expected} 个参数，实际存在 ${actual} 个参数。\n${getHelpMessage(params)}`,
  illegalReplyMessageCount: (params: ParamsDefinition) =>
    '不合法的回复消息。该命令需要回复 1 条消息，实际没有回复任何消息。' +
    '\n先在聊天中发送作为参数的消息，再选择回复你发送的消息并发送机器人指令。' +
    `\n${getHelpMessage(params)}`,
  illegalArguments: (params: ParamsDefinition) => `不合法的参数。\n${getHelpMessage(params)}`,
  illegalReplyMessage: (params: ParamsDefinition) => `不合法的回复消息。\n${getHelpMessage(params)}`
}
