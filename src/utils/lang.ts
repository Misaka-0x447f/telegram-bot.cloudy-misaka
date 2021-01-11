// @ts-ignore
export {default as stringify} from 'json-stringify-safe'

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const rand = (start = 0, stop = 1) =>
  Math.random() * (stop - start) + start
