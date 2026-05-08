import got from 'got'

type OpenRouterCreditsResponse = {
  data?: {
    total_credits?: number
    total_usage?: number
  }
}

type OpenRouterKeyResponse = {
  data?: {
    byok_usage?: number
    byok_usage_daily?: number
    byok_usage_monthly?: number
    byok_usage_weekly?: number
    include_byok_in_limit?: boolean
    is_free_tier?: boolean
    label?: string
    limit?: null | number
    limit_remaining?: null | number
    limit_reset?: null | string
    usage?: number
    usage_daily?: number
    usage_monthly?: number
    usage_weekly?: number
  }
}

export type OpenRouterCredits = {
  remainingCredits: number
  totalCredits: number
  totalUsage: number
}

export type OpenRouterKeyInfo = {
  isFreeTier: boolean
  label?: string
  limit: null | number
  limitRemaining: null | number
  limitReset: null | string
  usage: number
  usageDaily: number
  usageMonthly: number
  usageWeekly: number
}

const getAuthorizationHeader = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`
})

export const fetchOpenRouterCredits = async (managementKey: string) => {
  const response = await got
    .get('https://openrouter.ai/api/v1/credits', {
      headers: getAuthorizationHeader(managementKey)
    })
    .json<OpenRouterCreditsResponse>()

  const totalCredits = response.data?.total_credits
  const totalUsage = response.data?.total_usage

  if (typeof totalCredits !== 'number' || typeof totalUsage !== 'number') {
    throw new Error(`Invalid OpenRouter credits response: ${JSON.stringify(response)}`)
  }

  return {
    remainingCredits: totalCredits - totalUsage,
    totalCredits,
    totalUsage
  } as OpenRouterCredits
}

export const fetchOpenRouterKeyInfo = async (apiKey: string) => {
  const response = await got
    .get('https://openrouter.ai/api/v1/key', {
      headers: getAuthorizationHeader(apiKey)
    })
    .json<OpenRouterKeyResponse>()

  const keyData = response.data

  if (!keyData) {
    throw new Error(`Invalid OpenRouter key response: ${JSON.stringify(response)}`)
  }

  return {
    isFreeTier: keyData.is_free_tier === true,
    label: keyData.label,
    limit: keyData.limit ?? null,
    limitRemaining: keyData.limit_remaining ?? null,
    limitReset: keyData.limit_reset ?? null,
    usage: keyData.usage || 0,
    usageDaily: keyData.usage_daily || 0,
    usageMonthly: keyData.usage_monthly || 0,
    usageWeekly: keyData.usage_weekly || 0
  } as OpenRouterKeyInfo
}
