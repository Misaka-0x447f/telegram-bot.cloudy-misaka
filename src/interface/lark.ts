/* eslint-disable camelcase */
import got from 'got'
import telemetry from '../utils/telemetry'
import persistConfig from '../utils/configFile'

const appId = persistConfig.entries.tokenLark.id
const appSecret = persistConfig.entries.tokenLark.token

const fetchBearerToken = async () => {
  const res = (await got
    .post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/',
      {
        json: {
          app_id: appId,
          app_secret: appSecret
        }
      }
    )
    .json()) as {
    tenant_access_token: string
    msg: string
    expire: number
    code: number
  }
  const match = res.tenant_access_token
  if (match) return match
  telemetry('Failed to fetch bearer token. Got result', res)
  return null
}

export const sendMessage = async (message: string, chatId: string) => {
  if (!appSecret) {
    console.warn('lark bot has been disabled.')
    return
  }
  const token = await fetchBearerToken()
  if (!token) return
  return got
    .post('https://open.feishu.cn/open-apis/message/v4/send/', {
      headers: {
        Authorization: `Bearer ${token}`
      },
      json: {
        chat_id: chatId,
        msg_type: 'text',
        content: {
          text: message
        }
      }
    })
    .json()
    .catch((el) =>
      telemetry(
        `Sending lark message to ${chatId} with content ${message} failed.`,
        el
      )
    )
}
