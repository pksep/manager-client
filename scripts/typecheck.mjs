import { createRequire } from 'node:module'

if ('bun' in process.versions) {
  console.error(
    'Для проверки типов Vue требуется Node.js. Установите Node.js в сборочное окружение и запускайте bun run typecheck без --bun.',
  )
  process.exit(1)
}

const require = createRequire(import.meta.url)
const checker = require.resolve('vue-tsc/bin/vue-tsc.js')

process.argv = [process.argv[0], checker, ...process.argv.slice(2)]
require(checker)
