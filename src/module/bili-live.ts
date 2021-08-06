import { BotType, getTelegramBotByAnyBotName } from "../interface/telegram";
import { fetchRoomInfo, getLiveIDByShortId } from '../interface/bilibili'
import store from '../store/runtime'
import telemetry from '../utils/telemetry'
import { formatMinute, isNumeric } from '../utils/lang'
import { TelegramBotName } from "../utils/type";
import configFile from "../utils/configFile";

const configs = configFile.entries.master.biliLive

const worker = async (
  bot: BotType,
  config: typeof configs[TelegramBotName]
) => {
  let id = config.watch
  // 短号查询长号
  if (isNumeric(id) && parseInt(id) < 10000) {
    id = await getLiveIDByShortId(id)
  }

  const res = await fetchRoomInfo(id)
  const isOnline = res.live_status === 1

  if (!store.bili[id]) {
    store.bili[id] = {
      wasOnline: false,
      lastCategory: res.area_name,
      lastOnline: null,
    }
  }

  const info = {
    title: res.title,
    category: res.area_name,
    desc: res.description,
    lastOnline: store.bili[id].lastOnline?.toString(),
    liveMinutesUntilNow: formatMinute(
      (new Date().getTime() - store.bili[id].lastOnline?.getTime?.()!) / 60000
    ),
  }

  if (isOnline && !store.bili[id]?.wasOnline) {
    telemetry('[bili-live] running online hook').then()
    await bot.runActions(
      config.onlineActions,
      { defaultChatId: config.dest! },
      info
    )
  } else if (!isOnline && store.bili[id]?.wasOnline) {
    telemetry('[bili-live] running offline hook').then()
    await bot.runActions(
      config.offlineActions,
      { defaultChatId: config.dest! },
      info
    )
  }

  if (
    res.area_name !== store.bili[id].lastCategory &&
    store.bili[id].lastCategory
  ) {
    await bot.runActions(
      config.categoryChangeActions,
      { defaultChatId: config.dest! },
      info
    )
  }

  if (isOnline) {
    store.bili[id].lastOnline = res.live_time
  }
  store.bili[id].wasOnline = isOnline
  store.bili[id].lastCategory = res.area_name
}

for (const [botName, config] of Object.entries(configs)) {
  const run = () => {
    worker(getTelegramBotByAnyBotName(botName), config).finally(() =>
      setTimeout(() => run(), config.updateInterval)
    )
  }
  run()
}
