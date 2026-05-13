import 'core-js/stable'
import 'regenerator-runtime/runtime'
import persistConfig from './utils/persistConfig'
import telemetry, { setTelemetrySilent, telemetryInit } from './utils/telemetry'
import promiseRetry from 'promise-retry'

class CliArgumentError extends Error {
  code: string

  constructor (code: string, message: string) {
    super(message)
    this.name = 'CliArgumentError'
    this.code = code
  }
}

const writeErrorJson = (error: unknown) => {
  const payload = {
    error: {
      code:
        error instanceof CliArgumentError ||
        (error instanceof Error && 'code' in error && typeof error.code === 'string')
          ? error.code
          : 'runtime_error',
      context:
        error instanceof Error &&
        'context' in error &&
        typeof error.context === 'object' &&
        error.context
          ? error.context
          : undefined,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }
  }

  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`)
}

const parseCliArgs = (argv: string[]) => {
  let dryrunModule: 'galnet' | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--dryrun-module') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new CliArgumentError(
          'missing_dryrun_module',
          'Expected a module name after --dryrun-module.'
        )
      }
      if (value !== 'galnet') {
        throw new CliArgumentError(
          'unsupported_dryrun_module',
          `Unsupported dryrun module: ${value}`
        )
      }
      if (dryrunModule) {
        throw new CliArgumentError(
          'duplicate_dryrun_module',
          'The --dryrun-module argument can only be provided once.'
        )
      }

      dryrunModule = value
      i++
      continue
    }

    throw new CliArgumentError('unknown_argument', `Unknown argument: ${arg}`)
  }

  return {
    dryrunModule
  }
}

const startNormalMode = async () => {
  await persistConfig.init()
  telemetryInit()
  const bot = await import('./interface/telegram')
  import('./modules/index').catch((...args) => telemetry('index.ts/moduleLoader', ...args))

  persistConfig.entries.insight.telegramSupervisor.map((target) =>
    promiseRetry(async (retry) => {
      bot.exportBot.misaka
        .sendMessage(target, `System boot completed. ${process.env.BUILT_STRING}`)
        .catch(retry)
    })
  )

  const gracefulStopHandler = async () => {
    for (const operator of Object.values(bot.default)) {
      operator.instance.stop().then()
    }
    await Promise.all(
      persistConfig.entries.insight.telegramSupervisor.map((target) =>
        promiseRetry(async (retry) => {
          bot.exportBot.misaka
            .sendMessage(target, 'Shutting down.')
            .catch(retry)
        })
      )
    )
    process.exit(0)
  }
  process.once('SIGINT', gracefulStopHandler)
  process.once('SIGTERM', gracefulStopHandler)
}

const startDryRunMode = async (moduleName: 'galnet') => {
  setTelemetrySilent(true)
  await persistConfig.init()

  if (moduleName === 'galnet') {
    const { runGalnetDryRun } = await import('./dryrun/galnet')
    await runGalnetDryRun()
  }
}

try {
  const cliArgs = parseCliArgs(process.argv.slice(2))

  if (cliArgs.dryrunModule) {
    startDryRunMode(cliArgs.dryrunModule)
      .catch((error) => {
        writeErrorJson(error)
        process.exit(1)
      })
  } else {
    startNormalMode()
  }
} catch (error) {
  writeErrorJson(error)
  process.exit(1)
}
