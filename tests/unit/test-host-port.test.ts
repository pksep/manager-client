import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

interface PortCheck {
  exitCode: number
  output: string
}

async function checkHostPort(port: string): Promise<PortCheck> {
  const environment: Record<string, string> = {}

  for (const [name, value] of Object.entries(process.env)) {
    if (typeof value === 'string') environment[name] = value
  }

  const child = Bun.spawn(
    [process.execPath, '-e', "await import('./playwright.config.ts')"],
    {
      cwd: resolve(import.meta.dir, '../..'),
      env: { ...environment, MANAGER_TEST_HOST_PORT: port },
      timeout: 15000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  )
  const [exitCode, output] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ])

  return { exitCode, output }
}

test('порт демо API 4311 нельзя занять тестовой страницей', async (): Promise<void> => {
  const result = await checkHostPort('4311')

  expect(result.exitCode).not.toBe(0)
  expect(result.output).toContain(
    'Некорректный порт изолированной страницы теста',
  )
}, 20000)

test('валидный отдельный порт страницы не меняет фиксированный порт демо API', async (): Promise<void> => {
  expect((await checkHostPort('44310')).exitCode).toBe(0)
}, 20000)

test.each(['0', '-1', '65536', '4310.5', 'NaN'])(
  'некорректный порт %s не проходит прежние ограничения',
  async (port: string): Promise<void> => {
    const result = await checkHostPort(port)

    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain(
      'Некорректный порт изолированной страницы теста',
    )
  },
  20000,
)
