/**
 * This file is meant to be read config from some remote, but for now it only read config from local.
 */

import { TelegramBotName } from './type'
import fsj from 'fs-jetpack'

enum configFilesType {
  'master',
}

export type RegexString = string

export type Actions = ((
  | {
      type: 'message'
      text: string
      filter: RegexString
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
} & Record<ActionTypes, Actions>

const data: {
  value: {
    master: {
      proxy?: string
      insight: {
        telegramSupervisor: number[]
      }
      tokenTelegram: Array<{ name: TelegramBotName; token: string }>
      tokenTwitter: string
      biliLive: Record<
        TelegramBotName,
        ChatWorkerRule<
          'onlineActions' | 'offlineActions' | 'categoryChangeActions'
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
          allowUser?: number[]
        }
      >
      start: Record<TelegramBotName, Record<'actions', Actions>>
      twitterForwarding: Record<
        TelegramBotName,
        ChatWorkerRule & {
          allowConfigUser?: number[]
          options?: Partial<{
            excludeReplies: boolean
            excludeRetweets: boolean
          }>
        }
      >
    }
  }
} = { value: {} as Record<keyof typeof configFilesType, any> }

export default {
  init: () => {
    const f = fsj.read('./local-configs/master.json', 'json')
    if (!f)
      throw new Error(
        "config file './local-configs/master.json' does not exist."
      )
    data.value.master = f
  },
  get entries() {
    return data.value
  },
}
