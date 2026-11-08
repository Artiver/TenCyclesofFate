import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { applyPatch } from 'fast-json-patch'
import type { Operation } from 'fast-json-patch'

import { api } from '@/services/api'
import { ApiError, describeError } from '@/services/http'
import { GameSocket } from '@/services/socket'
import type { GameState, RollEvent, SaveInfo, SocketStatus } from '@/services/types'
import { useUiStore } from './ui'

/** 与后端 game_logic.py 中的字面量协议保持一致。 */
const START_TRIAL_ACTION = '开始试炼'
const INITIAL_OPPORTUNITIES = 10

/** WebSocket 单实例持有在模块作用域，避免被 Vue 响应式代理。 */
let socket: GameSocket | null = null

/**
 * 鉴权失效回调由 auth store 注册：game 不直接依赖 auth，避免两个 store 循环引用。
 */
let onSocketAuthError: (() => void) | null = null

/** 供 auth store 注册「WS 鉴权失败」的处理逻辑。 */
export function setSocketAuthErrorHandler(handler: () => void): void {
  onSocketAuthError = handler
}

export type BootstrapResult = 'ok' | 'guest' | 'error'

export const useGameStore = defineStore('game', () => {
  const ui = useUiStore()

  const session = ref<GameState | null>(null)
  const saveInfo = ref<SaveInfo | null>(null)
  const rollEvent = ref<RollEvent | null>(null)
  const lastRollEventId = ref<string | null>(null)
  const socketStatus = ref<SocketStatus>('idle')
  const firstRender = ref(true)

  const isProcessing = computed(() => session.value?.is_processing === true)
  const opportunities = computed(() => session.value?.opportunities_remaining ?? 0)
  const isInTrial = computed(() => session.value?.is_in_trial === true)
  const dailySuccessAchieved = computed(() => session.value?.daily_success_achieved === true)
  const currentLife = computed(() => session.value?.current_life ?? null)
  const history = computed(() => session.value?.display_history ?? [])

  const hasSave = computed(() => saveInfo.value?.has_save === true)
  const connectionReady = computed(() => socketStatus.value === 'open')

  /** 行动输入行：只有身处试炼中才需要输入。 */
  const inputVisible = computed(() => isInTrial.value)
  /** 试炼按钮：不在试炼中、且没有被「天道斥逐」（opportunities = -10）时才出现。 */
  const startVisible = computed(() => !isInTrial.value && opportunities.value >= 0)
  const startTrialLabel = computed(() => {
    if (dailySuccessAchieved.value) return '今日功德圆满'
    if (opportunities.value <= 0) return '机缘已尽'
    if (opportunities.value === INITIAL_OPPORTUNITIES) return '开始第一次试炼'
    return '开启下一次试炼'
  })
  const startTrialDisabled = computed(
    () =>
      dailySuccessAchieved.value ||
      opportunities.value <= 0 ||
      isProcessing.value ||
      !connectionReady.value,
  )
  const actionDisabled = computed(() => isProcessing.value || !connectionReady.value)
  const actionBusy = computed(() => isProcessing.value)

  const canSave = computed(() => !isProcessing.value)
  const canLoad = computed(() => !isProcessing.value && hasSave.value)
  const canDeleteSave = computed(() => !isProcessing.value && hasSave.value)
  const saveLabel = computed(() => (hasSave.value ? '覆盖存档' : '存档'))

  function checkRollEvent(): void {
    const event = session.value?.roll_event
    if (event && event.id && event.id !== lastRollEventId.value) {
      lastRollEventId.value = event.id
      rollEvent.value = event
    }
  }

  function replaceSession(next: GameState): void {
    session.value = next
    checkRollEvent()
  }

  function applyStatePatch(patch: Operation[]): void {
    // 增量消息必须先有全量基线，否则直接丢弃（服务端首次连接一定先推 full_state）。
    if (!session.value) return
    try {
      // mutateDocument = true：直接在响应式对象上打补丁。若传 false，fast-json-patch 会先把整份
      // 状态（含全部叙事历史）深拷贝一次，等于把服务端用增量省下的开销又还了回去。
      const result = applyPatch(session.value, patch, true, true)
      // 仅当补丁是根级 replace（path 为空）时 newDocument 才是新对象，此时需要换引用。
      if (result.newDocument !== session.value) {
        session.value = result.newDocument as GameState
      }
      checkRollEvent()
    } catch (error) {
      console.error('Failed to apply state patch:', error)
    }
  }

  async function connectSocket(): Promise<void> {
    if (!socket) {
      socket = new GameSocket({
        onFullState: replaceSession,
        onPatch: applyStatePatch,
        onError: (detail) => {
          void ui.alert(`WebSocket Error: ${detail}`, { title: '连接异常' })
        },
        onAuthError: () => {
          // Cookie 过期/被清除：直接重连只会被反复拒绝，交给 auth 清理状态并回登录页。
          onSocketAuthError?.()
        },
        onStatusChange: (status) => {
          socketStatus.value = status
        },
      })
    }

    try {
      await socket.connect()
    } catch (error) {
      console.error('WebSocket connection failed:', error)
    }
  }

  /**
   * 进入游戏：拉当日 session → 拉存档信息 → 渲染首屏 → 建立 WebSocket。
   * 只有确实未登录时才返回 `guest`；网络抖动或 5xx 返回 `error`，避免把用户误判成访客。
   */
  async function bootstrap(): Promise<BootstrapResult> {
    ui.setFullscreenLoading(true)
    try {
      const initialState = await api.initGame()
      firstRender.value = true
      replaceSession(initialState)

      try {
        saveInfo.value = await api.getSaveInfo()
      } catch (error) {
        // 存档信息失败不影响开局，但按钮状态会失真，留痕便于排查。
        console.warn('Failed to load save info:', describeError(error))
        saveInfo.value = null
      }

      await connectSocket()
      return 'ok'
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return 'guest'
      console.error(`Session initialization failed: ${describeError(error)}`)
      return 'error'
    } finally {
      // 失败时的本地状态由调用方（auth）统一清理，这里保持单一职责。
      ui.setFullscreenLoading(false)
    }
  }

  function reset(): void {
    socket?.disconnect()
    socket = null
    session.value = null
    saveInfo.value = null
    rollEvent.value = null
    lastRollEventId.value = null
    socketStatus.value = 'idle'
    firstRender.value = true
  }

  function consumeFirstRender(): boolean {
    if (!firstRender.value) return false
    firstRender.value = false
    return true
  }

  /** 发送玩家行动，返回是否真的发出（未连接或处理中则不发）。 */
  function submitAction(raw: string): boolean {
    const action = raw.trim()
    if (!action) return false

    // 后端在 is_processing 期间会丢弃任何动作（game_logic.py），这里同口径拦截。
    if (isProcessing.value) return false

    if (!socket || !socket.isOpen) {
      void ui.alert('连接已断开，请刷新。', { title: '连接异常' })
      return false
    }

    socket.send(action)
    return true
  }

  function startTrial(): boolean {
    return submitAction(START_TRIAL_ACTION)
  }

  async function save(): Promise<void> {
    if (isProcessing.value) return
    const confirmed = await ui.confirm(
      hasSave.value ? '已有存档，确定覆盖吗？' : '确定保存当前进度吗？',
    )
    if (!confirmed) return

    try {
      saveInfo.value = await api.saveGame()
      await ui.alert('存档成功')
    } catch (error) {
      await ui.alert(describeError(error, '存档失败'))
    }
  }

  async function load(): Promise<void> {
    if (isProcessing.value) return
    if (!hasSave.value) {
      await ui.alert('暂无存档')
      return
    }
    const confirmed = await ui.confirm('读档将覆盖当前进度，确定继续吗？')
    if (!confirmed) return

    try {
      replaceSession(await api.loadGame())
      await ui.alert('读档成功')
    } catch (error) {
      await ui.alert(describeError(error, '读档失败'))
    }
  }

  async function deleteSave(): Promise<void> {
    if (isProcessing.value) return
    if (!hasSave.value) {
      await ui.alert('暂无存档')
      return
    }
    const confirmed = await ui.confirm('确定删除存档吗？此操作不可恢复。')
    if (!confirmed) return

    try {
      saveInfo.value = await api.deleteSave()
      await ui.alert('存档已删除')
    } catch (error) {
      await ui.alert(describeError(error, '删除存档失败'))
    }
  }

  return {
    // state
    session,
    saveInfo,
    rollEvent,
    socketStatus,
    firstRender,
    // derived
    isProcessing,
    opportunities,
    isInTrial,
    dailySuccessAchieved,
    currentLife,
    history,
    hasSave,
    connectionReady,
    inputVisible,
    startVisible,
    startTrialLabel,
    startTrialDisabled,
    actionDisabled,
    actionBusy,
    canSave,
    canLoad,
    canDeleteSave,
    saveLabel,
    // actions
    bootstrap,
    reset,
    consumeFirstRender,
    submitAction,
    startTrial,
    save,
    load,
    deleteSave,
  }
})