import { fetchGalnet } from '../interface/galnet'
import { matchGlossaryEntries, translateGalnetArticle } from '../interface/translate'
import persistConfig from '../utils/persistConfig'
import { splitGalnetContent } from '../utils/galnetContent'

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const createDryRunError = (
  message: string,
  context: Record<string, unknown>,
  cause?: unknown
) => {
  const error = new Error(message) as Error & {
    code: string
    context: Record<string, unknown>
  }

  error.code = 'galnet_dryrun_error'
  error.context = context
  if (cause instanceof Error && cause.stack) {
    error.stack = `${error.stack}\nCaused by: ${cause.stack}`
  }

  return error
}

const getLatestArticle = async () => {
  const articles = await fetchGalnet()
  if (
    articles.length === 0 ||
    articles.some((entry) => Object.values(entry).some((value) => !value))
  ) {
    throw new Error('Galnet 数据异常。')
  }

  return articles[0]!
}

const getModelInfo = () => ({
  baseURL: persistConfig.entries.openrouter.baseURL || 'https://openrouter.ai/api/v1',
  model: persistConfig.entries.openrouter.model
})

const buildDryRunPayload = async (botName: string) => {
  const totalStartedAt = Date.now()
  const fetchStartedAt = Date.now()
  const article = await getLatestArticle()
  const fetchMs = Date.now() - fetchStartedAt
  const paragraphs = splitGalnetContent(article.content!)
  const matchedGlossary = matchGlossaryEntries([article.title!].concat(paragraphs).join('\n'))
  const translateStartedAt = Date.now()
  const translation = await translateGalnetArticle(article.title!, paragraphs)
  const translateMs = Date.now() - translateStartedAt

  return {
    bot: {
      name: botName
    },
    debug: {
      article_meta: {
        cover: article.cover,
        date: article.date,
        publishedAt: article.publishedAt,
        timestamp: article.timestamp,
        url: article.url
      },
      matched_glossary: matchedGlossary,
      model_info: getModelInfo(),
      timing: {
        fetchMs,
        totalMs: Date.now() - totalStartedAt,
        translateMs
      },
      translate_error_string: ''
    },
    dryrun: true,
    module: 'galnet',
    source: {
      paragraphs,
      title: article.title
    },
    translation: {
      paragraphs: translation.paragraphs,
      title: translation.title
    }
  }
}

export const runGalnetDryRun = async () => {
  const configs = Object.entries(persistConfig.entries.galnet)
  if (configs.length === 0) {
    throw createDryRunError(
      'No galnet bot configured.',
      { module: 'galnet' }
    )
  }

  for (const [botName] of configs) {
    try {
      const payload = await buildDryRunPayload(botName)
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    } catch (error) {
      throw createDryRunError(
        `Galnet dry run failed for bot ${botName}: ${getErrorMessage(error)}`,
        { botName, module: 'galnet' },
        error
      )
    }
  }
}
