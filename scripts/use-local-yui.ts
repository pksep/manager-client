import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { resolve, join } from 'node:path'

// Until manager components are released, overlay a local library build into the
// installed package. Unlike a symlink this keeps Vue resolved from the consumer.
const source = resolve(process.argv[2] || '../.worktrees/manager-yui-audit')
const consumer = resolve(process.argv[3] || '.')
const target = join(consumer, 'node_modules', '@pksep', 'yui')
const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
if (
  metadata.name !== '@pksep/yui' ||
  !existsSync(
    join(source, 'dist/components/ChatMessage/ChatMessageSurface.vue.d.ts'),
  )
) {
  throw new Error('Сначала соберите ветку manager библиотеки sep_yui')
}
if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
  if (realpathSync(target) !== realpathSync(source))
    throw new Error('Подключена другая локальная библиотека; проверьте путь')
  // Non-recursive removal of the junction itself; its target is never removed.
  rmdirSync(target)
}
mkdirSync(target, { recursive: true })
function copyBuild(from: string, to: string) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name.endsWith('.tgz')) continue
    if (entry.isDirectory())
      copyBuild(join(from, entry.name), join(to, entry.name))
    else if (entry.isFile())
      writeFileSync(join(to, entry.name), readFileSync(join(from, entry.name)))
  }
}
copyBuild(join(source, 'dist'), join(target, 'dist'))
writeFileSync(
  join(target, 'package.json'),
  JSON.stringify(metadata, null, 2) + '\n',
)
console.info('Локальная сборка sep_yui подключена:', target)
