import got from 'got'
import { HttpsProxyAgent } from 'hpagent'

export const downloadStream = (url: string) =>
  got.stream({
    url,
    agent: process.env.HTTP_PROXY
      ? {
          https: new HttpsProxyAgent({
            proxy: process.env.HTTP_PROXY
          })
        }
      : {}
  })
