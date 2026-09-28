import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const majorIndex = args.indexOf('--major')
const profileIndex = args.indexOf('--profile')
const majors = majorIndex < 0 ? ['3', '4'] : [args[majorIndex + 1]]
const profiles = profileIndex < 0 ? ['ssr', 'static-inline', 'static-external'] : [args[profileIndex + 1]]
if (majors.some(major => !['3', '4'].includes(major)) || profiles.some(profile => !['ssr', 'static-inline', 'static-external'].includes(profile)))
  throw new Error('版本或构建配置无效')

const lockHash = createHash('sha256').update(await readFile(new URL('../pnpm-lock.yaml', import.meta.url))).digest('hex')
for (const major of majors) {
  for (const profile of profiles) {
    console.log(`构建 Nuxt ${major}：${profile}`)
    await new Promise((resolve, reject) => {
      const child = spawn('pnpm', ['--filter', `@page-inspector/nuxt${major}`, profile === 'ssr' ? 'build' : 'generate'], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, INSPECTOR_PROFILE: profile },
      })
      child.on('error', reject)
      child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`构建失败：${code ?? signal}`)))
    })
    const app = new URL(`../apps/nuxt${major}/`, import.meta.url)
    const manifest = JSON.parse(await readFile(new URL('package.json', app), 'utf8'))
    const directory = new URL(`.output/${profile}/`, app)
    await mkdir(directory, { recursive: true })
    await writeFile(new URL('fixture-build.json', directory), `${JSON.stringify({ app: manifest.name, nuxt: manifest.dependencies.nuxt, profile, node: process.version, lockHash, builtAt: new Date().toISOString() }, null, 2)}\n`)
  }
}
