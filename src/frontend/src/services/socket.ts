import type { Operation } from 'fast-json-patch'
import { ungzip } from 'pako'

import type { GameState, SocketStatus } from './types'

const RECONNECT_DELAY = 5000

interface SocketHandlers {
  onFullState: (state: GameState) => void
  onPatch: (patch: Operation[]) => void
  onError: (detail: string) => void
  onStatusChange: (status: SocketStatus) => void
}

interface ServerMessage {
  type?: string
  data?: GameState
  patch?: Operation[]
  detail?: string
}

/** 把 gzip 字节解成字符串（pako 3 用 `toText: true` 直接返回 UTF-8 文本）。 */
function decodeGzip(buffer: ArrayBuffer): string {
  return ungzip(new Uint8Array(buffer), { toText: true })
}

/**
 * WebSocket 客户端：
 * - Cookie 鉴权，URL 不带 token；
 * - 服务端消息为 gzip 压缩的二进制 JSON；
 * - `full_state` / `patch` / `error` 三种消息；
 * - 非主动断开时每 5s 重连，主动断开（注销账户）后不再重连。
 */
export class GameSocket {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private preventReconnect = false
  private hasConnected = false
  private status: SocketStatus = 'idle'

  constructor(private readonly handlers: SocketHandlers) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  connect(): Promise<void> {
    this.preventReconnect = false

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve()
    }

    this.clearReconnectTimer()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    this.setStatus(this.hasConnected ? 'reconnecting' : 'connecting')

    return new Promise((resolve, reject) => {
      socket.onopen = () => {
        this.hasConnected = true
        this.setStatus('open')
        resolve()
      }

      socket.onmessage = (event) => {
        void this.handleMessage(event)
      }

      socket.onerror = () => {
        console.error('WebSocket error.')
        if (!this.hasConnected) {
          reject(new Error('WebSocket connection failed'))
        }
      }

      socket.onclose = () => {
        this.socket = null
        if (this.preventReconnect) {
          this.setStatus('closed')
          return
        }
        this.setStatus('reconnecting')
        this.reconnectTimer = setTimeout(() => {
          void this.connect().catch(() => undefined)
        }, RECONNECT_DELAY)
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
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.hasConnected = false
    this.setStatus('closed')
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
      if (data instanceof ArrayBuffer) {
        return JSON.parse(decodeGzip(data)) as ServerMessage
      }
      if (typeof data === 'string') {
        return JSON.parse(data) as ServerMessage
      }
      if (data instanceof Blob) {
        return JSON.parse(decodeGzip(await data.arrayBuffer())) as ServerMessage
      }
      return null
    } catch (error) {
      console.error('Failed to decompress or parse WebSocket message:', error)
      return null
    }
  }

  private setStatus(status: SocketStatus): void {
    this.status = status
    this.handlers.onStatusChange(status)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}