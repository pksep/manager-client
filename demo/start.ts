import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const children: Bun.Subprocess[] = []
let stopping = false

function stop(code: number) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
}

process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))

async function checkPort(port: number) {
  await new Promise<void>((accept, reject) => {
    const probe = createServer()
    probe.once('error', (error) =>
      reject(
        new Error(
          `Не удалось открыть порт ${port}. Если демо уже запущено, откройте http://127.0.0.1:4310/. Причина: ${error.message}`,
        ),
      ),
    )
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () =>
      probe.close((error) => (error ? reject(error) : accept())),
    )
  })
}

function start(name: string, args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  children.push(child)
  void child.exited.then((code) => {
    if (stopping) return
    console.error(`${name} остановлен (код ${code}). Демо завершает работу.`)
    stop(code || 1)
  })
}

async function waitForReady(url: string) {
  const deadline = Date.now() + 30_000
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1000),
      })
      await response.body?.cancel()
      if (response.ok) return
    } catch {
      // A process may need a moment to bind its port.
    }
    await Bun.sleep(200)
  }
  if (!stopping) throw new Error(`Сервис не запустился за 30 секунд: ${url}`)
}

try {
  if (!existsSync(resolve(root, 'node_modules/vite/bin/vite.js'))) {
    throw new Error(
      'Сначала установите зависимости: bun install --frozen-lockfile --ignore-scripts',
    )
  }
  if (
    !existsSync(
      resolve(
        root,
        'node_modules/@pksep/yui/dist/components/ChatMessage/ChatMessageSurface.vue.d.ts',
      ),
    )
  ) {
    throw new Error(
      'Нужна локальная сборка sep_yui ветки manager. Выполните bun run scripts/use-local-yui.ts; подготовка библиотеки описана в README.md.',
    )
  }
  // Check both ports before starting anything; never stop an existing process.
  await checkPort(4310)
  await checkPort(4311)
  if (!stopping) {
    start('Сервис сообщений', ['demo/server.ts'])
    start('Страница виджета', [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      '4310',
      '--strictPort',
      ...(process.argv.includes('--force') ? ['--force'] : []),
    ])
    await Promise.all([
      waitForReady('http://127.0.0.1:4310/'),
      waitForReady('http://127.0.0.1:4311/__demo/state'),
    ])
    if (!stopping) {
      console.info('\nДемо готово: http://127.0.0.1:4310/')
      console.info(
        'Оставьте эту команду работающей. Ctrl+C остановит страницу и сервис сообщений.',
      )
    }
  }
} catch (error) {
  if (!stopping) console.error(error instanceof Error ? error.message : error)
  stop(1)
}
