import got from 'got'

type EdsmEliteServerResponse = {
  lastUpdate?: string
  message?: string
  status?: number
  type?: string
}

export type EliteServerStatus = {
  lastUpdate?: string
  message: string
  status?: number
  type: string
}

export const fetchEliteServerStatus = async () => {
  const response = await got
    .get('https://www.edsm.net/api-status-v1/elite-server')
    .json<EdsmEliteServerResponse>()

  if (typeof response.type !== 'string' || typeof response.message !== 'string') {
    throw new Error(`Invalid EDSM status response: ${JSON.stringify(response)}`)
  }

  return {
    lastUpdate: response.lastUpdate,
    message: response.message,
    status: response.status,
    type: response.type
  } as EliteServerStatus
}
