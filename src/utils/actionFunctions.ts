import { randInt } from './lang'
import { isFunction, isNull, isObject } from 'lodash-es'
import telemetry from './telemetry'

const functions = {
  randItem: (...args: unknown[]) => args[randInt(0, args.length - 1)],
}
/**
 * action function be like: ${title}\n${randItem(爽哥今天吃什么, 昏睡上播)}
 * where ${title} is simple replacement, ${randItem(a, b)} is a function that only accepts string
 * space between comma is optional
 */
export const runActionFunctions = (text: string) => {
  const regex = new RegExp(
    `\${(?<function>${Object.keys(functions).join('|')})((?<args>.+?))}`,
    'g'
  )
  const match = text.match(regex)
  if (!match) return text
  return text.replaceAll(regex, (...args: any[]) => {
    const res = args.find(isObject) as { function: string; args: string } | null
    if (isNull(res)) {
      telemetry(
        `Assertion error: function parse error while resolving action functions. source string: ${text}, match result: ${match}, function parse result: ${args}`
      ).then()
      return '<function parse error>'
    }
    if (!isFunction((functions as any)[res.function])) {
      telemetry(
        `Assertion error: action function not exist. Expected one of [${Object.keys(
          functions
        )}], got ${res.function}.`
      ).then()
      return `<function not exist: ${res.function}>`
    }
    return (functions as any)[res.function](...res.args.split(',').map(el => el.trim()))
  })
}
