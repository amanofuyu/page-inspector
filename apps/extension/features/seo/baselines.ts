import type { SeoIdentity, SeoSnapshot } from './model'
import { sameSeoIdentity } from './model'

/** 仅缓存当前会话已验证基线；服务进程重启时自然清空。 */
export class SeoBaselines {
  private entries = new Map<
    number,
    { snapshot: SeoSnapshot, bytes: number, at: number }
  >()

  clear(tabId: number) {
    this.entries.delete(tabId)
  }

  put(snapshot: SeoSnapshot) {
    if (
      snapshot.source !== 'navigation-response'
      || snapshot.association !== 'matched'
      || !snapshot.identity.documentId
    ) {
      throw new Error('仅可共享已关联的实际文档基线。')
    }
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength
    if (bytes > 6 * 1024 * 1024)
      throw new Error('SEO 基线超过会话预算。')
    this.clear(snapshot.identity.tabId)
    while (
      this.entries.size
      && (this.entries.size >= 4
        || [...this.entries.values()].reduce((sum, item) => sum + item.bytes, 0)
        + bytes
        > 12 * 1024 * 1024)
    ) {
      this.clear(this.entries.keys().next().value!)
    }
    this.entries.set(snapshot.identity.tabId, {
      snapshot,
      bytes,
      at: Date.now(),
    })
  }

  get(identity: SeoIdentity) {
    const value = this.entries.get(identity.tabId)
    if (!value)
      return null
    if (Date.now() - value.at > 10 * 60 * 1000) {
      this.clear(identity.tabId)
      return null
    }
    return sameSeoIdentity(value.snapshot.identity, identity)
      ? value.snapshot
      : null
  }
}
