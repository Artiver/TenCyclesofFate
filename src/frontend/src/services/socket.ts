import type { Operation } from 'fast-json-patch'

import type { GameState, SocketStatus } from './types'

/** 重连退避：1s 起，逐次翻倍，上限 30s，再叠 20% 抖动避免多端同时打到服务端。 */
const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000
/** 握手超时：避免 bootstrap 的 `await connect()` 永远不 settle，导致全屏遮罩不消失。 */
const CONNECT_TIMEOUT = 8000
/** 服务端在 Cookie 缺失 / token 失效时以 policy violation 关闭（见 src/backend/api/ws.py），重连无意义。 */
const CLOSE_CODE_AUTH = 1008

interface SocketHandlers {
  onFullState: (state: GameState) => void
  onPatch: (patch: Operation[]) => void
  onError: (detail: string) => void
  /** 鉴权失败（Cookie 过期/被清除），调用方应清理本地登录态并回到登录视图。 */
  onAuthError: () => void
  onStatusChange: (status: SocketStatus) => void
}

interface ServerMessage {
  type?: string
  data?: GameState
  patch?: Operation[]
  detail?: string
}

/**
 * 把 gzip 字节解成字符串：用浏览器原生 DecompressionStream（Chrome 80+/Safari 16.4+/Firefox 113+），
 * 不再为此引入 pako。不支持时抛错，由 parseMessage 统一记录。
 */
async function decodeGzip(buffer: ArrayBuffer): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持 DecompressionStream，无法解压服务端消息')
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

/**
 * WebSocket 客户端：
 * - Cookie 鉴权，URL 不带 token；
 * - 服务端消息为 gzip 压缩的二进制 JSON；
 * - `full_state` / `patch` / `error` 三种消息；
 * - 非主动断开时按指数退避重连；1008（鉴权失败）不重连，改为通知调用方重新登录。
 */
export class GameSocket {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private preventReconnect = false
  private hasConnected = false
  private retryCount = 0
  private visibilityBound = false

  constructor(private readonly handlers: SocketHandlers) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  connect(): Promise<void> {
    this.preventReconnect = false

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return Promise.resolve()
    }

    this.clearReconnectTimer()
    this.bindVisibility()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    this.setStatus(this.hasConnected ? 'reconnecting' : 'connecting')

    return new Promise((resolve, reject) => {
      let settled = false
      let timeout: ReturnType<typeof setTimeout> | null = null

      // 无论 open 还是 close 都只结算一次；close 之后的重连由 handleClose 负责。
      const settle = (action: () => void): void => {
        if (settled) return
        settled = true
        if (timeout !== null) {
          clearTimeout(timeout)
          timeout = null
        }
        action()
      }

      timeout = setTimeout(() => {
        settle(() => {
          this.abortSocket(socket)
          reject(new Error('WebSocket connection timeout'))
        })
      }, CONNECT_TIMEOUT)

      socket.onopen = () => {
        this.hasConnected = true
        this.retryCount = 0
        this.setStatus('open')
        settle(resolve)
      }

      socket.onmessage = (event) => {
        void this.handleMessage(event)
      }

      // 连接错误后浏览器一定会再触发 onclose，错误分支统一交给 onclose 处理。
      socket.onerror = () => {
        console.error('WebSocket error.')
      }

      socket.onclose = (event) => {
        if (this.socket === socket) this.socket = null
        settle(() => reject(new Error(`WebSocket closed (${event.code})`)))
        this.handleClose(event.code)
      }
    })
  }

  send(action: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify({ action }))
    return true
  }

  disconnect(): void {
    this.preventReconnect = true
    this.clearReconnectTimer()
    this.unbindVisibility()
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.hasConnected = false
    this.retryCount = 0
    this.setStatus('closed')
  }

  private handleClose(code: number): void {
    this.clearReconnectTimer()

    if (this.preventReconnect) {
      this.setStatus('closed')
      return
    }

    if (code === CLOSE_CODE_AUTH) {
      this.preventReconnect = true
      this.unbindVisibility()
      this.setStatus('closed')
      this.handlers.onAuthError()
      return
    }

    this.setStatus('reconnecting')
    const delay = this.nextReconnectDelay()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect().catch(() => undefined)
    }, delay)
  }

  private nextReconnectDelay(): number {
    const base = Math.min(RECONNECT_MAX_DELAY, RECONNECT_BASE_DELAY * 2 ** this.retryCount)
    this.retryCount = Math.min(this.retryCount + 1, 8)
    return Math.round(base * (0.8 + Math.random() * 0.4))
  }

  /** 切回前台时立即重试，并清零退避（后台标签页会被浏览器节流甚至断网）。 */
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return
    if (this.preventReconnect || this.socket) return
    this.retryCount = 0
    void this.connect().catch(() => undefined)
  }

  private bindVisibility(): void {
    if (this.visibilityBound) return
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.visibilityBound = true
  }

  private unbindVisibility(): void {
    if (!this.visibilityBound) return
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.visibilityBound = false
  }

  /** 丢弃 socket 时不触发 onclose 的自动重连。 */
  private abortSocket(socket: WebSocket): void {
    if (this.socket === socket) this.socket = null
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    try {
      socket.close()
    } catch {
      // 已处于 CLOSED 时 close() 可能抛错，忽略。
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const message = await this.parseMessage(event.data)
    if (!message) return

    switch (message.type) {
      case 'full_state':
        if (message.data) this.handlers.onFullState(message.data)
        break
      case 'patch':
        if (message.patch) this.handlers.onPatch(message.patch)
        break
      case 'error':
        this.handlers.onError(message.detail ?? '未知错误')
        break
      default:
        break
    }
  }

  private async parseMessage(data: unknown): Promise<ServerMessage | null> {
    try {
      // binaryType 固定为 arraybuffer，二进制帧只会是 ArrayBuffer。
      if (data instanceof ArrayBuffer) return JSON.parse(await decodeGzip(data)) as ServerMessage
      if (typeof data === 'string') return JSON.parse(data) as ServerMessage
      return null
    } catch (error) {
      console.error('Failed to decompress or parse WebSocket message:', error)
      return null
    }
  }

  private setStatus(status: SocketStatus): void {
    this.handlers.onStatusChange(status)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}