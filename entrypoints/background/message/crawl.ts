import type { CrawlResult } from '@/libs/messaging'
import { safe } from '@/utils/safe'

/**
 * Nuxt 序列化数据格式的类型定义
 * 这是一个自引用的数据结构，使用索引来避免重复数据
 */
export type NuxtPayloadValue
  = | string
    | number
    | boolean
    | null
    | ['ShallowReactive', number] // 浅响应式对象引用
    | ['Reactive', number] // 响应式对象引用
    | ['Set'] // Set 对象占位符
    | NuxtPayloadArray
    | NuxtPayloadObject

export type NuxtPayloadArray = Array<number | NuxtPayloadValue>

export interface NuxtPayloadObject {
  [key: string]: number | NuxtPayloadValue
}

export type NuxtPayload = NuxtPayloadArray

export interface NuxtPayloadResult {
  data: Record<string, Record<string, any>>
  once: any[]
  path: string
  serverRendered: boolean
  state: Record<string, any>
  _errors: Record<string, any>
}

export async function handleCrawl(_url?: string) {
  // console.log('handleCrawl', url)

  const { promise, resolve } = Promise.withResolvers<CrawlResult | null>()

  const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0]

  if (!tab?.id) {
    resolve(null)
  }
  else {
    const res = await safe(browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        function getNuxtData(): NuxtPayload | null {
          const dataString = document.getElementById('__NUXT_DATA__')?.textContent
          const data = dataString ? JSON.parse(dataString) : null
          return data
        }

        function parseNuxtPayload(data: NuxtPayload): NuxtPayloadResult | null {
          const memo = new Map()

          function resolve(index: any) {
            if (index === undefined || index === null)
              return null

            if (memo.has(index))
              return memo.get(index)

            const raw = data[index]

            if (typeof raw !== 'object' || raw === null) {
              return raw
            }

            if (Array.isArray(raw) && raw.length === 2 && typeof raw[0] === 'string' && typeof raw[1] === 'number') {
              return resolve(raw[1])
            }

            if (Array.isArray(raw) && raw.length === 1 && raw[0] === 'Set') {
              return []
            }

            if (Array.isArray(raw)) {
              const arr = [] as any[]
              memo.set(index, arr)
              raw.forEach((i) => {
                if (typeof i === 'number')
                  arr.push(resolve(i))
                else arr.push(i)
              })
              return arr
            }

            const obj = {} as Record<string, any>
            memo.set(index, obj)
            for (const key in raw) {
              obj[key] = resolve(raw[key])
            }
            return obj
          }

          return resolve(0)
        }

        function getParsedNuxtData(): NuxtPayloadResult | null {
          const source = getNuxtData()

          if (!source) {
            return null
          }

          return parseNuxtPayload(source)
        }

        return {
          ssrData: getParsedNuxtData(),
        }
      },
    }))

    if (res.success) {
      const result = res.data?.[0]?.result

      if (result) {
        resolve(result)
      }
      else {
        resolve(null)
      }
    }
    else {
      resolve(null)
    }
  }

  return promise
}
