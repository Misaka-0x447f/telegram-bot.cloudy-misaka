import { BlobServiceClient } from '@azure/storage-blob'
import { TelegramBotName } from '../interface/telegram'

const secret = process.env.AZURE_SECRET
if (!secret)
  throw new Error('Azure Storage Account Connection String is Required.')

enum configFilesType {
  'master',
}

const configFiles = Object.keys(configFilesType)
const containerName = 'default'
const containerClient =
  BlobServiceClient.fromConnectionString(secret).getContainerClient(
    containerName
  )
const blobClients = configFiles.map((el) => ({
  client: containerClient.getBlobClient(el),
  fileName: `${el}.json`,
}))

const streamToString = async (readableStream: any): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    readableStream.on('data', (data: any) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data))
    })
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks).toString())
    })
    readableStream.on('error', reject)
  })

type RegexString = string

export type Actions = ((
  | {
      type: 'message'
      text: string
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
  filter?: RegexString
  dest?: number
})[][]

export type ChatWorkerRule<ActionTypes extends string = 'actions'> = {
  watch: string | number
  updateInterval: number
  dest?: number
} & Record<ActionTypes, Actions>

const data: {
  value: {
    master: {
      tokenTelegram: Array<{ name: TelegramBotName; token: string }>
      tokenLark: { id: string; token: string }
      tokenTwitter: string
      biliLive: Record<
        TelegramBotName,
        ChatWorkerRule<
          'onlineActions' | 'offlineActions' | 'categoryChangeActions'
        >
      >
      chatBridge: Array<{
        from: number
        to: number
      }>
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
        }
      >
      start: Record<TelegramBotName, Record<'actions', Actions>>
      twitterForwarding: Record<
        TelegramBotName,
        ChatWorkerRule & {
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
  init: async () => {
    data.value = Object.fromEntries(
      await Promise.all(
        blobClients.map(async (el) => [
          el.fileName,
          await streamToString(
            (
              await el.client.download()
            ).readableStreamBody!
          ),
        ])
      )
    )
  },
  get entries() {
    return data.value
  },
}
