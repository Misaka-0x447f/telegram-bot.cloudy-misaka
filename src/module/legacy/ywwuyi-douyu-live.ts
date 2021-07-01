import { fetchRoomStatus } from '../../interface/douyu'
import store from '../../store/runtime'
import bot from '../../interface/telegram'
import { formatMinute, sleep } from '../../utils/lang'

const sendMessage = (text: string) =>
  bot.ywwuyi.sendMessage(-1001322798787, text)

const run = () => setTimeout(worker, 30000)

const worker = async () => {
  const res = await fetchRoomStatus('6655')
  if (!res) {
    run()
    return
  }
  if (res.room.isOnline && !store.douyu.ywwuyiLiveOnline) {
    await sendMessage(
      `${res.room.liveName}\n昏睡上播`
    )
  } else if (!res.room.isOnline && store.douyu.ywwuyiLiveOnline) {
    const liveMinutes =
      (res.room.lastOfflineTime.getTime() - res.room.lastOnlineTime.getTime()) /
      60000
    await sendMessage(
      `已播${formatMinute(liveMinutes)}`
    )
    await sleep(20000)
    await sendMessage('zzzzzzzzz')
  } else if (
    res.room.category !== store.douyu.ywwuyiLiveCategory &&
    store.douyu.ywwuyiLiveCategory !== null
  ) {
    await sendMessage(`主播已更换分区为：${res.room.category}`)
  }
  store.douyu.ywwuyiLiveOnline = res.room.isOnline
  store.douyu.ywwuyiLiveCategory = res.room.category
  run()
}

worker().then()
