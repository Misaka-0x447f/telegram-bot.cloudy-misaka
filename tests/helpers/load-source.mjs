import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Keep deployment configuration and real bot polling out of unit tests.
export function loadSource(relativePath, dependencies = {}) {
  const filename = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url))
  const localRequire = createRequire(filename)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : localRequire(name),
    module, module.exports
  )
  return module.exports
}
