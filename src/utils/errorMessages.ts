export interface ParamsDefinition {
  argumentList?: Array<{ name: string; acceptable: string }>
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
      content.push(`[${el.name}]`.padEnd(maxLength + 3).concat(el.acceptable))
    })
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
    '不合法的回复消息。该命令需要 1 条回复消息，实际没有回复任何消息。\n' +
    `例如先发送 av39092411，再回复该消息并选择命令 /fetch_video。\n${getHelpMessage(params)}`,
  illegalArguments: (params: ParamsDefinition) => `不合法的参数。\n${getHelpMessage(params)}`,
  illegalReplyMessage: (params: ParamsDefinition) => `不合法的回复消息。\n${getHelpMessage(params)}`
}
