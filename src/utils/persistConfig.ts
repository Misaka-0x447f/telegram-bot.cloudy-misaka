/**
 * This file is meant to be read config from some remote, but for now it only read config from local.
 */

import { TelegramBotName } from './type'
import JSON5 from 'json5'
import fsj from 'fs-jetpack'
import * as tt from 'telegraf/typings/telegram-types'
import got from 'got'

export type RegexString = string

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

const data: {
  value: {
    insight: {
      azureSecret: string
      telegramSupervisor: number[]
    }
    tokenTelegram: Array<{ name: TelegramBotName; token: string }>
    tokenDeepl: string
    tokenS3: {
      endpoint: string
      bucket: string
      id: string
      key: string
    }
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
    fetchSticker: Record<TelegramBotName, {}>
    fetchVideo: Record<TelegramBotName, {}>
    galnet: Record<
      TelegramBotName,
      ChatWorkerRule & {
        superusers?: number[]
      }
    >
    getUserInfo: Record<TelegramBotName, {}>
    ping: Record<TelegramBotName, Record<'actions', Actions>>
    repeater: Record<TelegramBotName, {}>
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
} = { value: {} as any }

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
    return data.value
  }
}
