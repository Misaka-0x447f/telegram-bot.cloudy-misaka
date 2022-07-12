/* eslint-disable camelcase */
import got from 'got'
import telemetry from '../utils/telemetry'
import persistConfig from '../utils/persistConfig'

export const translateText = async (text: string, {
  source = undefined as string | undefined,
  target = 'ZH'
} = {}) => {
  const data: any = await got.post('https://api-free.deepl.com/v2/translate', {
    searchParams: {
      auth_key: persistConfig.entries.tokenDeepl,
      text,
      source_lang: source,
      target_lang: target
    }
  }).json().catch(e => {
    telemetry('Error while translating text.', e)
    return null
  })
  if (!data.translations) {
    await telemetry(`Error while translating text. ${JSON.stringify(data)}`)
    return null
  }
  return data.translations as Array<{
    detected_source_language: string,
    text: string
  }>
}
