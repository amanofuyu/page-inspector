import { gzipSync } from 'node:zlib'

let sequence = 0
export default defineEventHandler((event) => {
  const query = getQuery(event)
  if (query.mode === 'redirect')
    return sendRedirect(event, '/api/inspector-probe?mode=json&token=redirect', 302)
  const value = { source: 'nuxt3-client-probe', sequence: ++sequence, token: query.token, message: '中文😀', products: [{ id: 'sku-001', price: 120 }] }
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  if (query.mode === 'cache') {
    setHeader(event, 'etag', '"inspector-cache-v1"')
    setHeader(event, 'cache-control', 'no-cache')
    if (getHeader(event, 'if-none-match') === '"inspector-cache-v1"') {
      setResponseStatus(event, 304)
      return ''
    }
    return { ...value, sequence: 0 }
  }
  setHeader(event, 'cache-control', 'no-store')
  if (query.mode === 'gzip') {
    setHeader(event, 'content-encoding', 'gzip')
    return gzipSync(JSON.stringify({ ...value, repeated: '可压缩内容'.repeat(500) }))
  }
  return value
})
