/** 后端下发的单局判定事件（session.roll_event，瞬时字段）。 */
export interface RollEvent {
  id: string
  type: string
  target: number
  sides: number
  result: number
  outcome: string
  result_text?: string
}

/** GET/POST/DELETE /api/game/save 返回的存档元信息。 */
export interface SaveInfo {
  has_save: boolean
  saved_at?: number | null
  session_date?: string | null
}

/** 后端 session 状态（WS full_state 已剔除 internal_history）。 */
export interface GameState {
  player_id: string
  session_date: string
  opportunities_remaining: number
  daily_success_achieved: boolean
  is_in_trial: boolean
  is_processing: boolean
  current_life: Record<string, unknown> | null
  display_history: string[]
  roll_event: RollEvent | null
  redemption_code?: string | null
}

export interface AuthResult {
  username: string
  user_id: number
}

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'