export type Safe<T>
  = | {
    success: true
    data: T
  }
  | {
    success: false
    error: unknown
  }

export function safe<T>(promise: Promise<T>, err?: string): Promise<Safe<T>>
export function safe<T>(func: () => T, err?: string): Safe<T>
export function safe<T>(
  promiseOrFunc: Promise<T> | (() => T),
  err?: string,
): Promise<Safe<T>> | Safe<T> {
  if (promiseOrFunc instanceof Promise) {
    return safeAsync(promiseOrFunc, err)
  }
  return safeSync(promiseOrFunc, err)
}

async function safeAsync<T>(
  promise: Promise<T>,
  err?: string,
): Promise<Safe<T>> {
  try {
    const data = await promise
    return { data, success: true }
  }
  catch (e) {
    // console.error(e)
    if (err !== undefined) {
      return { success: false, error: err }
    }
    if (e instanceof Error) {
      return { success: false, error: e.message }
    }
    if (e) {
      return { success: false, error: e }
    }
    return { success: false, error: 'Something went wrong' }
  }
}

function safeSync<T>(
  func: () => T,
  err?: string,
): Safe<T> {
  try {
    const data = func()
    return { data, success: true }
  }
  catch (e) {
    // console.error(e)
    if (err !== undefined) {
      return { success: false, error: err }
    }
    if (e instanceof Error) {
      return { success: false, error: e.message }
    }
    if (e) {
      return { success: false, error: e }
    }
    return { success: false, error: 'Something went wrong' }
  }
}
