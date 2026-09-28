import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const [major, profile, portText] = process.argv.slice(2)
const port = Number(portText)
if (!['3', '4'].includes(major) || !['ssr', 'static-inline', 'static-external'].includes(profile) || !Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('用法：node scripts/serve-fixture.mjs <3|4> <ssr|static-inline|static-external> <端口>')
const app = fileURLToPath(new URL(`../apps/nuxt${major}/`, import.meta.url))
const output = resolve(app, '.output', profile)
const manifest = JSON.parse(await readFile(resolve(output, 'fixture-build.json'), 'utf8'))
if (manifest.profile !== profile || manifest.app !== `@page-inspector/nuxt${major}`)
  throw new Error('构建产物与启动配置不一致，请重新构建')

if (profile === 'ssr') {
  const child = spawn(process.execPath, [resolve(output, 'server/index.mjs')], {
    cwd: app,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) },
  })
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => child.kill(signal))
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 0
  })
}
else {
  const publicRoot = resolve(output, 'public')
  const base = profile === 'static-external' ? '/inspect/' : '/'
  const mime = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname)
      if (!pathname.startsWith(base)) {
        response.writeHead(404).end()
        return
      }
      let file = resolve(publicRoot, pathname.slice(base.length))
      if (file !== publicRoot && !file.startsWith(publicRoot + sep)) {
        response.writeHead(403).end()
        return
      }
      if ((await stat(file)).isDirectory())
        file = resolve(file, 'index.html')
      const content = await readFile(file)
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
      response.end(content)
    }
    catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 400).end()
    }
  })
  server.listen(port, '127.0.0.1', () => console.log(`Nuxt ${major} ${profile}：http://127.0.0.1:${port}${base}`))
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close()
      server.closeAllConnections()
    })
  }
}
