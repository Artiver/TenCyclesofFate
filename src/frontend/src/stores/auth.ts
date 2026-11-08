import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { api } from '@/services/api'
import { describeError } from '@/services/http'
import type { AuthResult } from '@/services/types'
import { useGameStore } from './game'
import { useUiStore } from './ui'

type AuthStatus = 'unknown' | 'authenticated' | 'guest' | 'error'

/**
 * 身份状态：不保存 token（HttpOnly Cookie 由浏览器自动携带），
 * 只记录「是否已认证」以及探测结果，供路由守卫使用。
 */
export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('unknown')
  const pending = ref(false)

  const isAuthenticated = computed(() => status.value === 'authenticated')

  /**
   * 页面首次进入时探测登录态；重复调用复用首次结果。
   * `error` 表示网络/服务端故障——此时不能把用户当成访客踢去登录页，
   * 路由守卫会留在游戏视图并提示重试。
   */
  async function ensureSession(): Promise<AuthStatus> {
    if (status.value !== 'unknown') return status.value

    const game = useGameStore()
    const result = await game.bootstrap()
    status.value = result === 'ok' ? 'authenticated' : result === 'guest' ? 'guest' : 'error'
    return status.value
  }

  /** 探测失败后的重试入口（`error` 态唯一能回到正常态的方式）。 */
  async function retry(): Promise<AuthStatus> {
    status.value = 'unknown'
    return ensureSession()
  }

  async function authenticate(
    request: () => Promise<AuthResult>,
  ): Promise<void> {
    pending.value = true
    try {
      await request()

      const game = useGameStore()
      const result = await game.bootstrap()
      if (result === 'ok') {
        status.value = 'authenticated'
        return
      }
      status.value = result === 'guest' ? 'guest' : 'error'
      throw new Error(
        result === 'guest'
          ? '登录成功，但初始化试炼失败，请刷新重试'
          : '无法连接服务器，请检查网络后重试',
      )
    } finally {
      pending.value = false
    }
  }

  function login(user: string, password: string): Promise<void> {
    return authenticate(() => api.login(user, password))
  }

  function register(user: string, password: string): Promise<void> {
    return authenticate(() => api.register(user, password))
  }

  async function logout(): Promise<void> {
    // 服务端可能已失效（网络/超时），但本地状态必须清理干净，否则界面停在登录态。
    try {
      await api.logout()
    } finally {
      resetLocal()
    }
  }

  /** 注销账户：永久删除账号与全部数据；返回是否真的注销成功。 */
  async function deleteAccount(): Promise<boolean> {
    const game = useGameStore()
    const ui = useUiStore()

    if (game.isProcessing) return false

    const confirmed = await ui.confirm(
      '注销账户将永久删除本账号及其全部数据（存档、命途、兑换码等），且不可恢复。确定注销吗？',
    )
    if (!confirmed) return false

    try {
      await api.deleteAccount()
    } catch (error) {
      await ui.alert(describeError(error, '注销失败'))
      return false
    }

    resetLocal()
    await ui.alert('账号已注销，此界与此身，皆成过往。')
    return true
  }

  function resetLocal(): void {
    useGameStore().reset()
    useUiStore().setSceneImage(null)
    status.value = 'guest'
  }

  /**
   * WS 以 1008 关闭代表 Cookie 已失效（后端会先 accept 再关闭，以便把 code 送达客户端）。
   * 只清本地状态；跳转登录视图由 router 侧注册的回调负责（store 不应依赖 router）。
   */
  function handleSessionExpired(): void {
    resetLocal()
  }

  return {
    status,
    pending,
    isAuthenticated,
    ensureSession,
    retry,
    handleSessionExpired,
    login,
    register,
    logout,
    deleteAccount,
  }
})