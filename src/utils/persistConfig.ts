/**
 * This file is meant to be read config from some remote, but for now it only read config from local.
 */

import { TelegramBotName } from './type'
import JSON5 from 'json5'
import fsj from 'fs-jetpack'
import * as tt from 'telegraf/typings/telegram-types'
import got from 'got'

export type RegexString = string
type EmptyConfig = Record<string, never>

export type Actions = ((
  | {
  type: 'message'
  text: string
  filter?: RegexString
  extra?: tt.ExtraEditMessage
}
  | {
  type: 'sleep'
  time: number
}
  | {
  type: 'messageByForward'
  source: number
  messageId: number
}
  ) & {
  dest?: number
})[][]

export type ChatWorkerRule<ActionTypes extends string = 'actions'> = {
  watch: string
  updateInterval: number
  dest?: number
} & Record<ActionTypes, Actions>

export type StatusWorkerRule<ActionTypes extends string> = {
  dest?: number
  pollingIntervalOnFailure: number
  pollingIntervalOnSuccess: number
} & Partial<Record<ActionTypes, Actions>>

export type OpenRouterMonitorRule = {
  alertActions: Actions
  balanceAlertThreshold?: number
  dest?: number
  pollingInterval: number
  quotaRemainingPercentageAlertThreshold?: number
  recoverActions?: Actions
}

type PersistConfigEntries = {
  insight: {
    azureSecret: string
    telegramSupervisor: number[]
  }
  openrouter: {
    baseURL?: string
    managementKey?: string
    model: string
    token: string
  }
  tokenTelegram: Array<{ name: TelegramBotName; token: string }>
  tokenDeepl: string
  tokenBsky: {
    service: string,
    identifier: string,
    password: string,
  },
  biliForwarding: Record<TelegramBotName, {
    source: number
    dest: number // 转发至
    updateInterval: number
  }>
  // Available var: title, category, desc, lastOnline, liveMinutesUntilNow
  biliLive: Record<
    TelegramBotName,
    ChatWorkerRule<
      | 'onlineActions'
      | 'offlineActions'
      | 'categoryChangeActions'
      | 'titleChangeActions'
    >
  >
  chatBridge: Record<
    TelegramBotName,
    {
      list: Array<{
        from: number
        to: number
      }>
    }
  >
  // Available var: content, url
  bluesky: Record<TelegramBotName,
    ChatWorkerRule<'newPostActions'> & {
    superusers?: number[]
  }>
  fetchSticker: Record<TelegramBotName, EmptyConfig>
  fetchVideo: Record<TelegramBotName, EmptyConfig>
  galnet: Record<
    TelegramBotName,
    ChatWorkerRule & {
    superusers?: number[]
  }
  >
  galnetStatus: Record<
    TelegramBotName,
    StatusWorkerRule<
      'outageActions' |
      'recoverActions' |
      'startupActions' |
      'non200Actions' |
      'non200RecoverActions'
    >
  >
  openrouterMonitor: Record<
    TelegramBotName,
    OpenRouterMonitorRule
  >
  getUserInfo: Record<TelegramBotName, EmptyConfig>
  ping: Record<TelegramBotName, Record<'actions', Actions>>
  repeater: Record<TelegramBotName, EmptyConfig>
  say: Record<
    TelegramBotName,
    {
      list: Array<{
        name: string
        id: number
      }>
      adminChatIds?: number[]
      adminChatIdsCanReceiveReply?: true
    }
  >
  start: Record<TelegramBotName, Record<'actions', Actions>>
  killall: {
    superusers?: number[]
  }
}

const data: {
  value?: PersistConfigEntries
} = {}

export default {
  init: async () => {
    const path = process.env.CONFIG_PATH
    if (!path) {
      throw new Error('missing env CONFIG_PATH')
    }
    if (path.match(/https?:/)) {
      data.value = JSON5.parse(await got(path).text())
      console.log(data.value)
    } else {
      const f = await fsj.readAsync(path, 'utf8')
      if (!f) throw new Error(`config file ${path} does not exist.`)
      data.value = JSON5.parse(f)
    }
  },
  get entries () {
    if (!data.value) {
      throw new Error('persistConfig has not been initialized.')
    }

    return data.value
  }
}
