import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import babel from '@rollup/plugin-babel'
import json from '@rollup/plugin-json'
import url from '@rollup/plugin-url'
import fsj from 'fs-jetpack'
import replace from '@rollup/plugin-replace'
import gitCommitInfo from 'git-commit-info'

const commit = gitCommitInfo()

fsj.remove('dist')

const extensions = ['.js', '.jsx', '.ts', '.tsx']

export default {
  input: './src/index.ts',

  output: [
    {
      dir: 'dist',
      format: 'cjs'
    }
  ],
  // Specify here external modules which you don't want to include in your bundle (for instance: 'lodash', 'moment' etc.)
  // https://rollupjs.org/guide/en/#external
  external: [],

  plugins: [
    replace({
      'process.env.BUILT_STRING': `\`Built from revision ${commit.shortCommit} (${commit.date}) with commitMsg "${commit.message}" at ${new Date().toLocaleString('zh', { timeZone: 'Asia/Shanghai' })}\``
    }),

    // Allows node_modules resolution
    resolve({ extensions, preferBuiltins: true }),

    json(),

    url({
      include: ['**/*.binary'],
      limit: 0
    }),

    // Allow bundling cjs modules. Rollup doesn't understand cjs
    commonjs(),

    // Compile TypeScript/JavaScript files
    babel({
      extensions,
      babelHelpers: 'bundled',
      include: ['src/**/*']
    })
  ]
}
