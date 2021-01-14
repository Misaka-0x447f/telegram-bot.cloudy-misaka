import { fetchRoomStatus } from '../interface/douyu'
import store from '../store'
import bot from '../interface/bot'
import { sleep } from '../utils/lang'

const sendMessage = (text: string) =>
  bot.ywwuyi.sendMessage(-1001322798787, text)

const run = () => setTimeout(worker, 30000)

const worker = async () => {
  const res = await fetchRoomStatus('6655')
  if (!res) {
    run()
    return
  }
  if (res.room.isOnline && !store.ywwuyiLiveOnline) {
    await sendMessage(
      `${res.room.liveName}\n昏睡上播 https://www.douyu.com/6655`
    )
    await sleep(20000)
    await sendMessage(`主播当前正在分区: ${res.room.category}`)
  } else if (!res.room.isOnline && store.ywwuyiLiveOnline) {
    const liveMinutes =
      (res.room.lastOfflineTime.getTime() - res.room.lastOnlineTime.getTime()) /
      60000
    await sendMessage(
      `已播${Math.floor(liveMinutes / 60)}小时${liveMinutes % 60}分钟`
    )
    await sleep(20000)
    await sendMessage('zzzzzzzzz')
  } else if (
    res.room.category !== store.ywwuyiLiveCategory &&
    store.ywwuyiLiveCategory !== null
  ) {
    await sendMessage(`主播已更换分区为：${res.room.category}`)
  }
  store.ywwuyiLiveOnline = res.room.isOnline
  store.ywwuyiLiveCategory = res.room.category
  run()
}

worker().then()

console.log('ywwuyi-live ready.')
