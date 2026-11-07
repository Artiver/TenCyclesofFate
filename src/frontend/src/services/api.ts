import { request } from './http'
import type { AuthResult, GameState, SaveInfo } from './types'

/**
 * 后端接口清单，与 src/backend/api/{auth,game}.py 一一对应。
 * 全部依赖 HttpOnly `token` Cookie，因此不需要显式 Authorization 头。
 */
export const api = {
  login(username: string, password: string) {
    return request<AuthResult>('/login', {
      method: 'POST',
      body: { username, password },
      fallbackMessage: '登录失败',
    })
  },

  register(username: string, password: string) {
    return request<AuthResult>('/register', {
      method: 'POST',
      body: { username, password },
      fallbackMessage: '注册失败',
    })
  },

  /** 服务端会清 Cookie 并 302 到 `/`，这里不需要解析响应体。 */
  async logout(): Promise<void> {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      // 登出失败不应阻塞本地状态清理
    }
  },

  deleteAccount() {
    return request<{ deleted: boolean }>('/account', {
      method: 'DELETE',
      fallbackMessage: '注销失败',
    })
  },

  initGame() {
    return request<GameState>('/game/init', {
      method: 'POST',
      fallbackMessage: '初始化游戏失败',
    })
  },

  saveGame() {
    return request<SaveInfo>('/game/save', {
      method: 'POST',
      fallbackMessage: '存档失败',
    })
  },

  getSaveInfo() {
    return request<SaveInfo>('/game/save', {
      fallbackMessage: '获取存档信息失败',
    })
  },

  loadGame() {
    return request<GameState>('/game/load', {
      method: 'POST',
      fallbackMessage: '读档失败',
    })
  },

  deleteSave() {
    return request<SaveInfo>('/game/save', {
      method: 'DELETE',
      fallbackMessage: '删除存档失败',
    })
  },
}