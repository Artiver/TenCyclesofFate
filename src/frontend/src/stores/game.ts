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
      const result = applyPatch(session.value, patch, true, false)
      session.value = result.newDocument as GameState
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
   * 返回 false 表示未登录（401）或初始化失败，由路由守卫回落到登录视图。
   */
  async function bootstrap(): Promise<boolean> {
    ui.setFullscreenLoading(true)
    try {
      const initialState = await api.initGame()
      firstRender.value = true
      replaceSession(initialState)

      try {
        saveInfo.value = await api.getSaveInfo()
      } catch {
        saveInfo.value = null
      }

      await connectSocket()
      return true
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        console.error(`Session initialization failed: ${describeError(error)}`)
      }
      reset()
      return false
    } finally {
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

    // 「开始试炼」允许在上一轮 is_processing 的收尾窗口内放行，避免被锁死。
    if (action !== START_TRIAL_ACTION && isProcessing.value) return false

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