export { default as stringify } from 'json-stringify-safe'

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

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

export const argsTypeValidation = (args: unknown[], rules: ((_: unknown) => boolean)[]) => args.every((val, key) => (rules[key] || (() => false))(val))

export const isNumeric = (n: any): n is string => !isNaN(parseFloat(n)) && isFinite(n)
