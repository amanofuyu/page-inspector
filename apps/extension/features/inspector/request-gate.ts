import type { CrawlResponse } from '../nuxt/types'
/** 递增代次用于拒绝导航或切换标签页前发起的旧请求。 */
export function createRequestGate() {
  let generation = 0
  return {
    invalidate: () => ++generation,
    current: (ticket: number) => ticket === generation,
    accepts: (ticket: number, tabId: number, requestId: string, response: CrawlResponse) => ticket === generation && response.tabId === tabId && response.requestId === requestId,
  }
}
