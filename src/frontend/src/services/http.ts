const API_BASE_URL = '/api'

/** 带 HTTP 状态码的接口错误，便于把 401/404/409 分流处理。 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** 服务端未返回 detail 时使用的兜底文案（对应旧实现的 `throw new Error('存档失败')` 等）。 */
  fallbackMessage?: string
  /** 响应体无需解析时置 false（如 logout 返回 302 跳转）。默认 true。 */
  parse?: boolean
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { detail?: unknown } | null
    const detail = payload?.detail
    return typeof detail === 'string' ? detail : null
  } catch {
    return null
  }
}

/**
 * 统一请求封装：同源 + HttpOnly Cookie 鉴权（前端不接触 token）。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, fallbackMessage = '请求失败，请稍后重试', parse = true } = options

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('网络异常，请检查连接', 0)
  }

  if (!response.ok) {
    const detail = await readDetail(response)
    throw new ApiError(detail || fallbackMessage, response.status)
  }

  if (!parse || response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

/** 把任意异常转成可展示的中文文案。 */
export function describeError(error: unknown, fallback = '操作失败'): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}