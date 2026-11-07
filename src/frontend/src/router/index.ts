import { createRouter, createWebHashHistory } from 'vue-router'

import { pinia } from '@/stores'
import { useAuthStore } from '@/stores/auth'

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
 * 之后复用探测结果。
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)
  const authenticated = await auth.ensureSession()

  if (to.name !== 'login' && !authenticated) {
    return { name: 'login' }
  }
  if (to.name === 'login' && authenticated) {
    return { name: 'game' }
  }
  return true
})

export default router