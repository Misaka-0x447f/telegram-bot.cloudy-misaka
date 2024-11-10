import crypto from 'crypto'

export { default as stringify } from 'json-stringify-safe'

export const sleep = (timeInMilliSecond: number) =>
  new Promise((resolve) => setTimeout(resolve, timeInMilliSecond))

export const rand = (start = 0, stop = 1) =>
  Math.random() * (stop - start) + start

export const randInt = (start = 0, stop = 1) => Math.round(rand(start, stop))

export const formatMinute = (minute: number) =>
  `${Math.floor(minute / 60)} 时 ${Math.round(minute % 60)
    .toString()
    .padStart(2, '0')} 分`

export const selectCase = <T>(
  ...cases: Array<[boolean, () => T]>
): T | void => {
  for (const [condition, action] of cases) {
    if (condition) return action()
  }
}

export const argsTypeValidation = (
  args: unknown[],
  rules: ((_: unknown) => boolean)[]
) => args.every((val, key) => (rules[key] || (() => false))(val))

export const isNumeric = (n: any): n is string =>
  !isNaN(parseFloat(n)) && isFinite(n)

export const getUnixTimeStamp = () => new Date().getTime()

export const sha1 = (text: string) => {
  const sha1tool = crypto.createHash('sha1')
  sha1tool.update(text)
  return sha1tool.digest('hex')
}

export const md5 = (input: string) => {
  return crypto.createHash('md5').update(input).digest('hex');
}

export const hmacSha256 = (key: string, message: string) => {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(message);
  return hmac.digest('hex');
}

export const tryCatchReturn = <T>(
  tryFunction: () => T,
  catchFunction: (_: Error) => T
) => {
  try {
    return tryFunction()
  } catch (e) {
    return catchFunction(e)
  }
}
