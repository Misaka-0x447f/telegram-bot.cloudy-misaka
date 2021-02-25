export default {
  tooFewArguments: (
    expected: string | number,
    actual: string | number
  ) =>
    `参数的数量不正确。需要 ${expected} 个参数，实际存在 ${actual} 个参数。\n` +
    [0, '0'].includes(actual)
      ? '你没有输入任何参数。先发送一条包含参数列表的消息，再回复该消息并选择命令。\n' +
        '例如先发送 av39092411，再回复该消息并选择命令 /fetch_video。'
      : '',
  unexpectedArguments: (
    argumentList: Array<{ name: string; acceptable: string }>
  ) => {
    const maxLength = argumentList.reduce((acc, cur) => {
      return Math.max(cur.name.length, acc)
    }, 0)
    let content = '参数错误。参数列表：'
    content += argumentList.map((el) => `[${el.name}]`).join(' ') + '\n'
    content += argumentList.map(
      (el) => el.name.padEnd(maxLength + 3) + el.acceptable
    )
    return content
  },
}
