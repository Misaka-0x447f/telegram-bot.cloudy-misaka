type cb<T> = (payload: T) => void

export default <T = void>() => {
  const cbs: Array<cb<T>> = []
  const sub = (cb: cb<T>) => {
    cbs.push(cb)
  }
  const unsub = (cb: cb<T>) => {
    const index = cbs.indexOf(cb)
    if (index === -1) return
    cbs.splice(index, 1)
  }
  const dispatch = (payload: T) => {
    cbs.map((v) => v((payload || {}) as T))
  }
  const once = (cb: cb<T>) => {
    sub((arg: T) => {
      cb(arg)
      unsub(cb)
    })
  }

  return {
    sub,
    unsub,
    dispatch,
    once,
  }
}
