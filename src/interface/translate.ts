import { generateText } from '@xsai/generate-text'
import { galnetGlossary } from '../data/galnetGlossary'
import type { GalnetGlossaryEntry } from '../data/galnetGlossary'
import telemetry from '../utils/telemetry'
import persistConfig from '../utils/persistConfig'

export type GalnetTranslation = {
  paragraphs: string[]
  title: string
}

const repositoryURL = 'https://github.com/Misaka-0x447f/telegram-bot.cloudy-misaka'

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasTerm = (source: string, candidate: string) =>
  new RegExp(`(^|[^A-Za-z])${escapeRegExp(candidate)}([^A-Za-z]|$)`, 'i').test(source)

export const matchGlossaryEntries = (source: string) =>
  galnetGlossary
    .filter((entry) =>
      [entry.term].concat(entry.aliases || []).some((candidate) => hasTerm(source, candidate))
    )
    .sort((left, right) => right.term.length - left.term.length)

const formatGlossaryEntry = (entry: GalnetGlossaryEntry) => {
  const aliases = entry.aliases?.length ? `; aliases=${entry.aliases.join(', ')}` : ''

  return [
    `- ${entry.term}`,
    `preferredZh=${entry.preferredZh}`,
    `policy=${entry.translationPolicy}`,
    `category=${entry.category}${aliases}`,
    `note=${entry.explanationZh}`
  ].join('; ')
}

const extractJsonObject = (text: string) => {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (objectStart < 0 || objectEnd <= objectStart) {
    throw new Error(`Invalid translation payload: ${text}`)
  }

  return text.slice(objectStart, objectEnd + 1)
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const hasTranslationFields = (
  value: object
): value is { paragraphs: unknown; title: unknown } =>
  'paragraphs' in value && 'title' in value

const isTranslationPayload = (value: unknown): value is GalnetTranslation => {
  if (!value || typeof value !== 'object' || !hasTranslationFields(value)) {
    return false
  }

  return typeof value.title === 'string' && isStringArray(value.paragraphs)
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const translateGalnetArticle = async (
  title: string,
  paragraphs: string[]
) => {
  const matchedGlossary = matchGlossaryEntries([title].concat(paragraphs).join('\n'))
  const glossaryText = matchedGlossary.length === 0
    ? '- No glossary entries matched. Preserve lore names in English if uncertain.'
    : matchedGlossary.map(formatGlossaryEntry).join('\n')

  const systemPrompt = [
    'You translate Elite Dangerous Galnet news from English into Simplified Chinese.',
    'Translate only the JSON payload from the user message.',
    'Return valid JSON only, with this exact shape:',
    '{"title":"string","paragraphs":["string"]}',
    'Keep the paragraph count identical to the input.',
    'Do not add code fences, notes, or extra keys.',
    'Do not invent lore or expand the article.',
    'Keep unknown proper nouns in English instead of guessing.',
    'Apply the glossary strictly when a matching term appears.',
    'For entries marked first_mention_bilingual, keep the preferredZh wording on first mention.',
    'If the source contains HTML fragments, preserve their meaning without adding new tags.',
    '',
    'Glossary:',
    glossaryText
  ].join('\n')

  try {
    const result = await generateText({
      apiKey: persistConfig.entries.openrouter.token,
      baseURL: persistConfig.entries.openrouter.baseURL || 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': repositoryURL,
        'X-Title': 'misaka-telegram-bot'
      },
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: JSON.stringify({
            title,
            paragraphs
          })
        }
      ],
      model: persistConfig.entries.openrouter.model,
      temperature: 0
    })

    if (!result.text) {
      throw new Error('Model returned empty text.')
    }

    const parsed: unknown = JSON.parse(extractJsonObject(result.text))
    if (!isTranslationPayload(parsed)) {
      throw new Error(`Unexpected translation object: ${result.text}`)
    }

    if (parsed.paragraphs.length !== paragraphs.length) {
      throw new Error(
        `Paragraph count mismatch. expected=${paragraphs.length} actual=${parsed.paragraphs.length}`
      )
    }

    return {
      title: parsed.title,
      paragraphs: parsed.paragraphs
    }
  } catch (error) {
    await telemetry(
      'interface/translate.ts/translateGalnetArticle',
      'Error while translating Galnet article.',
      getErrorMessage(error)
    )
    throw error
  }
}
