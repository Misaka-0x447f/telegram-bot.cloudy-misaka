import { BotType, getTelegramBotByAnyBotName } from '../interface/telegram'
import { fetchRoomInfo, getLiveIDByShortId } from '../interface/bilibili'
import store from '../store/runtime'
import { formatMinute, isNumeric } from '../utils/lang'
import { TelegramBotName } from '../utils/type'
import persistConfig from '../utils/persistConfig'
import telemetry from "../utils/telemetry";

const configs = persistConfig.entries.biliLive

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
      lastTitle: res.title,
      lastOnline: null
    }
  }

  const params = {
    title: res.title,
    category: res.area_name,
    desc: res.description,
    lastOnline: store.bili[id].lastOnline?.toString(),
    liveMinutesUntilNow: formatMinute(
      (new Date().getTime() - store.bili[id].lastOnline?.getTime?.()!) / 60000
    )
  }

  const events = {
    online: isOnline && !store.bili[id]?.wasOnline,
    offline: !isOnline && store.bili[id]?.wasOnline,
    categoryChange: res.area_name !== store.bili[id].lastCategory &&
      store.bili[id].lastCategory,
    titleChange: res.title !== store.bili[id].lastTitle
  }

  if (config.onlineActions && events.online) {
    await bot.runActions(
      config.onlineActions,
      { defaultChatId: config.dest! },
      params
    )
  } else if (config.offlineActions && events.offline) {
    await bot.runActions(
      config.offlineActions,
      { defaultChatId: config.dest! },
      params
    )
  }

  if (
    config.categoryChangeActions &&
    events.categoryChange && !events.online
  ) {
    await bot.runActions(
      config.categoryChangeActions,
      { defaultChatId: config.dest! },
      params
    )
  }

  if (config.titleChangeActions && events.titleChange && !events.online) {
    await bot.runActions(
      config.titleChangeActions,
      { defaultChatId: config.dest! },
      params
    )
  }

  if (isOnline) {
    store.bili[id].lastOnline = res.live_time
  }
  store.bili[id].wasOnline = isOnline
  store.bili[id].lastCategory = res.area_name
  store.bili[id].lastTitle = res.title
}

for (const [botName, config] of Object.entries(configs)) {
  const run = () => {
    worker(getTelegramBotByAnyBotName(botName), config).catch(telemetry).finally(() =>
      setTimeout(() => run(), config.updateInterval)
    )
  }
  run()
}
