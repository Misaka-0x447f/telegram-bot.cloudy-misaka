import bot from '../interface/bot'
import { fetchRoomInfo, getLiveIDByShortId } from '../interface/bilibili'
import store from '../store'
import { formatMinute, rand, sleep } from '../utils/lang'
import telemetry from '../utils/telemetry'

const sendMessage = (text: string) =>
  bot.ywwuyi.sendMessage(-1001322798787, text)

type Handler = (p: {
  title: string
  category: string
  description: string
  lastOnline: Date | null
}) => Promise<unknown>

const configs = [
  {
    id: 6655,
    handler: {
      online: ({ title }) => sendMessage(`${title}\n昏睡上播`),
      offline: async ({ lastOnline }) => {
        try {
          if (lastOnline) {
            await sendMessage(
                `已播${formatMinute(
                    (new Date().getTime() - lastOnline?.getTime?.()) / 60000
                )}`
            )
            await sleep(rand(20000, 60000))
          }
        } finally {
          await sendMessage('zzzzzzzzz')
        }
      },
      categoryChange: async ({ category }) => {
        await sendMessage(`你爽已更换分区：${category}`)
      },
    },
    interval: 30000,
  },
] as Array<{
  id: number
  handler: Partial<Record<'online' | 'offline' | 'categoryChange', Handler>>
  interval: number
}>

const worker = async (config: typeof configs[0]) => {
  let id = config.id
  // 短号查询长号
  if (id < 10000) {
    id = await getLiveIDByShortId(id)
  }

  const res = await fetchRoomInfo(id)
  const isOnline = res.live_status === 1

  if (!store.bili[id]) {
    store.bili[id] = { wasOnline: false, lastCategory: res.area_name, lastOnline: null }
  }

  const info: Parameters<Handler>[0] = {
    title: res.title,
    category: res.area_name,
    description: res.description,
    lastOnline: store.bili[id].lastOnline,
  }

  if (isOnline && !store.bili[id]?.wasOnline) {
    telemetry('[bili-live] running online hook')
    await config.handler?.online?.(info)
  } else if (!isOnline && store.bili[id]?.wasOnline) {
    telemetry('[bili-live] running offline hook')
    await config.handler?.offline?.(info)
  }

  if (
    res.area_name !== store.bili[id].lastCategory &&
    store.bili[id].lastCategory
  ) {
    await config.handler?.categoryChange?.(info)
  }

  if (isOnline) {
    store.bili[id].lastOnline = res.live_time
  }
  store.bili[id].wasOnline = isOnline
  store.bili[id].lastCategory = res.area_name
}

const run = (config: typeof configs[0]): any =>
  worker(config)
    .finally(() => setTimeout(() => run(config), config.interval))

configs.forEach(run)

console.log('bili-live ready.')
