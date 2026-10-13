import { expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '../..')
const checker = join(root, 'scripts/typecheck.mjs')

interface CheckResult {
  exitCode: number
  output: string
}

async function check(
  executable: string,
  project?: string,
): Promise<CheckResult> {
  const child = Bun.spawn(
    [
      executable,
      checker,
      '--noEmit',
      ...(project ? ['--project', project] : []),
    ],
    { cwd: root, stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
  )
  const [exitCode, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  return { exitCode, output: output + error }
}

test('Bun не подменяет настоящую проверку Vue или неявно пропускает компоненты', async (): Promise<void> => {
  const result = await check(process.execPath)

  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('Для проверки типов Vue требуется Node.js')
  expect(result.output).not.toContain('TS2307')
})

test('Node проверяет импорт Vue, типы внутри компонента и выражения шаблона', async (): Promise<void> => {
  const modules = realpathSync(join(root, 'node_modules'))
  const fixture = await mkdtemp(join(modules, '.manager-typecheck-'))

  try {
    await writeFile(
      join(fixture, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          lib: ['ES2022', 'DOM'],
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        include: ['entry.ts', 'Probe.vue'],
      }),
    )
    await writeFile(
      join(fixture, 'entry.ts'),
      "import Probe from './Probe.vue'\nexport { Probe }\n",
    )

    for (const scenario of [
      {
        source:
          '<script setup lang="ts">\nconst label: string = "ready"\n</script>\n<template>{{ label }}</template>',
        diagnostic: undefined,
      },
      {
        source:
          '<script setup lang="ts">\nconst label: number = "wrong"\n</script>\n<template>{{ label }}</template>',
        diagnostic: 'TS2322',
      },
      {
        source:
          '<script setup lang="ts">\nconst label: string = "ready"\n</script>\n<template>{{ label.missingTypecheckMethod() }}</template>',
        diagnostic: 'TS2339',
      },
    ]) {
      await writeFile(join(fixture, 'Probe.vue'), scenario.source)
      const result = await check('node', join(fixture, 'tsconfig.json'))

      expect(result.output).not.toContain('TS2307')
      if (scenario.diagnostic) {
        expect(result.exitCode).not.toBe(0)
        expect(result.output).toContain(scenario.diagnostic)
      } else {
        expect(result.output).toBe('')
        expect(result.exitCode).toBe(0)
      }
    }
  } finally {
    const target = realpathSync(fixture)
    if (
      dirname(target) !== modules ||
      !basename(target).startsWith('.manager-typecheck-')
    )
      throw new Error('Нельзя удалять чужие файлы при очистке проверки Vue')

    await rm(target, { recursive: true, force: true })
  }
}, 60000)
