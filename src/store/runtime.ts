import { twitterForwardingList } from '../module/twitter-forwarding'
import { isUndefined } from 'lodash-es'

type MessageHistory = { digest: string; from: string }

const store = {
  chatHistory: {} as Record<
    number,
    {
      nonRepeatCounter: number
      messageHistory: Array<MessageHistory>
      createMessageHistory: (el: MessageHistory) => void
    }
  >,
  twitterForwardingList: [] as Array<typeof twitterForwardingList[0]>,
  douyu: {
    ywwuyiLiveOnline: false,
    ywwuyiLiveCategory: null as null | string,
  },
  bili: {} as Record<
    string,
    {
      wasOnline: boolean
      lastCategory: null | string
      lastOnline: Date | null
    }
  >,
}

export const storeMethods = {
  createChatHistoryIfNX: (chatId: number) => {
    if (!isUndefined(store.chatHistory[chatId])) return
    const history: MessageHistory[] = []
    store.chatHistory[chatId] = {
      nonRepeatCounter: Infinity,
      messageHistory: history,
      createMessageHistory: (p) => {
        history.unshift(p)
        // splice from 30 to the end of array.
        history.splice(30)
      },
    }
  },
}

export default store
