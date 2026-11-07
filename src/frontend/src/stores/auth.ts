import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { api } from '@/services/api'
import { describeError } from '@/services/http'
import type { AuthResult } from '@/services/types'
import { useGameStore } from './game'
import { useUiStore } from './ui'

type AuthStatus = 'unknown' | 'authenticated' | 'guest'

/**
 * 身份状态：不保存 token（HttpOnly Cookie 由浏览器自动携带），
 * 只记录「是否已认证」以及探测结果，供路由守卫使用。
 */
export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('unknown')
  const username = ref<string | null>(null)
  const pending = ref(false)

  const isAuthenticated = computed(() => status.value === 'authenticated')

  /** 页面首次进入时探测登录态；重复调用复用首次结果。 */
  async function ensureSession(): Promise<boolean> {
    if (status.value !== 'unknown') return status.value === 'authenticated'

    const game = useGameStore()
    const ok = await game.bootstrap()
    status.value = ok ? 'authenticated' : 'guest'
    return ok
  }

  async function authenticate(
    request: () => Promise<AuthResult>,
  ): Promise<void> {
    pending.value = true
    try {
      const result = await request()
      username.value = result.username

      const game = useGameStore()
      const ok = await game.bootstrap()
      status.value = ok ? 'authenticated' : 'guest'
      if (!ok) throw new Error('登录成功，但初始化试炼失败，请刷新重试')
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
    await api.logout()
    resetLocal()
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
    username.value = null
  }

  return {
    status,
    username,
    pending,
    isAuthenticated,
    ensureSession,
    login,
    register,
    logout,
    deleteAccount,
  }
})