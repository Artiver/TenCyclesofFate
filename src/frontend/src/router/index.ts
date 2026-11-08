import { createRouter, createWebHashHistory } from 'vue-router'

import { pinia } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { setSocketAuthErrorHandler } from '@/stores/game'

/**
 * 使用 hash 模式：后端对任何 404 都会 302 到 `/`（main.py:46），
 * history 模式下刷新深链接会被绕回根路径，hash 模式可完全避开这一限制。
 */
const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'game',
      component: () => import('@/views/GameView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'game' },
    },
  ],
})

/**
 * 首次导航时探测登录态（等价旧实现的「加载即 POST /api/game/init」），
 * 之后复用探测结果（`error` 态需显式调用 `auth.retry()` 才会重新探测）。
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)
  const status = await auth.ensureSession()

  // `error`（网络/5xx）与 `guest`（401）都回登录页，但登录页会区分提示并提供重试入口。
  if (to.name !== 'login' && status !== 'authenticated') {
    return { name: 'login' }
  }
  if (to.name === 'login' && status === 'authenticated') {
    return { name: 'game' }
  }
  return true
})

/**
 * WS 鉴权失败（Cookie 过期/被清除）时：清本地状态并立刻跳回登录视图。
 * 路由守卫只在导航时执行，光改 store 状态会让用户停在没有数据的游戏视图里。
 */
setSocketAuthErrorHandler(() => {
  const auth = useAuthStore(pinia)
  auth.handleSessionExpired()
  void router.replace({ name: 'login' })
})

export default router