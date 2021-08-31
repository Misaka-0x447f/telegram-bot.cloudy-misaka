/**
 * This file is meant to be read config from some remote, but for now it only read config from local.
 */

import { TelegramBotName } from './type'
import JSON5 from 'json5'
import fsj from 'fs-jetpack'
import * as tt from "telegraf/typings/telegram-types";

enum configFilesType {
  'master',
}

export type RegexString = string

export type Actions = ((
  | {
      type: 'message'
      text: string
      filter?: RegexString,
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
    master: {
      insight: {
        telegramSupervisor: number[]
      }
      tokenTelegram: Array<{ name: TelegramBotName; token: string }>
      tokenTwitter: string
      biliLive: Record<
        TelegramBotName,
        ChatWorkerRule<
          'onlineActions' | 'offlineActions' | 'categoryChangeActions' | 'titleChangeActions'
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
          adminChatIds?: number[]
          adminChatIdsCanReceiveReply?: true
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
    const f = fsj.read('./local-configs/master.json5', 'utf8')
    if (!f)
      throw new Error(
        "config file './local-configs/master.json5' does not exist."
      )
    data.value.master = JSON5.parse(f)
  },
  get entries() {
    return data.value
  },
}
