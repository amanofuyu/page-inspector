import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { stringify } from 'devalue'

const nuxt3 = readFileSync(new URL('../fixtures/nuxt/nuxt-3.17.5.json', import.meta.url), 'utf8')
const nuxt4 = readFileSync(new URL('../fixtures/nuxt/nuxt-4.0.0.json', import.meta.url), 'utf8')
const stats = { slowStarted: 0, slowCompleted: 0 }
const inline = stringify({ data: { inlineOnly: true }, state: { preserved: true }, serverRendered: true })
function script(text, attrs = 'id="__NUXT_DATA__" data-ssr="true"') {
  return `<script type="application/json" ${attrs}>${text.replaceAll('<', '\\u003C')}</script>`
}
createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const path = url.pathname
  if (path === '/seo' || path === '/seo-next') {
    response.writeHead(200, { 'content-type': 'text/html;charset=utf-8', 'x-robots-tag': 'googlebot: noarchive', 'link': '</seo>; rel="canonical"' })
    response.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>SEO 服务端标题</title><meta name="description" content="服务端描述"><meta name="robots" content="noindex"><link rel="canonical" href="/seo"><link rel="alternate" hreflang="en" href="/en/seo"><meta property="og:image" content="/one.png"><meta property="og:image" content="/two.png"></head><body><h1>SEO 示例页面</h1><h2>二级标题</h2><h3>三级标题</h3><h4>四级标题</h4><h5>五级标题</h5><h6>六级标题</h6><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"SEO 示例"}</script><script>
      document.title = 'SEO 客户端标题';
      document.querySelector('[name="description"]').content = '客户端描述';
      document.querySelector('[name="robots"]').remove();
      const meta = document.createElement('meta'); meta.name = 'twitter:card'; meta.content = 'summary'; document.head.append(meta);
      window.nextRoute = () => { history.pushState({}, '', '/seo-next'); document.title = 'SEO 第二路由'; };
      </script><button onclick="nextRoute()">SEO 切换路由</button></body></html>`)
    return
  }
  if (path === '/stats') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(stats))
    return
  }
  if (path === '/_payload.json' || path === '/slow.json') {
    const send = () => {
      if (path === '/slow.json')
        stats.slowCompleted++
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(nuxt4)
    }
    if (path === '/slow.json') {
      stats.slowStarted++
      setTimeout(send, 1000)
    }
    else {
      send()
    }
    return
  }
  if (path === '/missing.json') {
    response.writeHead(404)
    response.end()
    return
  }
  if (path === '/login.json') {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<h1>登录</h1>')
    return
  }
  let content = script(nuxt3)
  if (path === '/empty')
    content = ''
  if (path === '/broken')
    content = script('broken')
  if (path === '/external')
    content = script(inline, 'id="__NUXT_DATA__" data-ssr="true" data-src="/_payload.json"')
  if (path === '/slow')
    content = script(inline, 'id="__NUXT_DATA__" data-ssr="true" data-src="/slow.json"')
  if (path === '/missing')
    content = script(inline, 'id="__NUXT_DATA__" data-ssr="true" data-src="/missing.json"')
  if (path === '/multi')
    content = script(nuxt3, 'data-nuxt-data="app-a" data-ssr="true"') + script(nuxt4, 'data-nuxt-data="app-b" data-ssr="true"')
  if (path === '/features') {
    const version = Number(url.searchParams.get('version') || 1)
    const shared = { text: '中文😀\n\\'.repeat(500), id: 'shared' }
    content = script(stringify({ data: { 'feature-lab': { watched: version === 3 ? {} : { price: version === 2 ? '220' : 120 }, sharedA: shared, sharedB: shared, many: Object.fromEntries(Array.from({ length: 12000 }, (_, i) => [`field${i}`, i])) } }, serverRendered: true }))
  }
  if (path === '/large')
    content = script(stringify({ data: Array.from({ length: 15000 }, (_, id) => ({ id, text: `项目 ${id}` })), state: { available: true }, serverRendered: true }))
  const sendDocument = () => {
    response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' })
    response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>本地 Nuxt 样例 ${path}</title><h1>Nuxt 协议样例</h1>${content}<button onclick="history.pushState({}, '', '/next')">切换路由</button></html>`)
  }
  // 用真实服务端延迟覆盖导航通知晚于请求开始的主文档。
  if (path === '/features' && url.searchParams.get('slow-document') === '1')
    setTimeout(sendDocument, 2200)
  else
    sendDocument()
}).listen(4318, '127.0.0.1')
