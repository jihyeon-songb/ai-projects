// 클로디 캐릭터 이미지 — 상태별로 다른 모습을 보여줍니다.
import idleUrl from '../../../assets/claudie/idle.png'
import workingUrl from '../../../assets/claudie/working.png'
import permissionUrl from '../../../assets/claudie/permission.png'
import doneUrl from '../../../assets/claudie/done.png'

export type ClaudieState = 'idle' | 'working' | 'permission' | 'done'

export const CLAUDIE_IMAGE: Record<ClaudieState, string> = {
  idle: idleUrl,
  working: workingUrl,
  permission: permissionUrl,
  done: doneUrl
}

// 완료 알림이 자동으로 사라지는 시간(ms). 0 이면 수동 닫기 전까지 유지.
export const NOTICE_AUTO_HIDE_MS = 8000

// "작업 중" 상태에서 아무 후속 이벤트가 없을 때 idle 로 되돌아가는 최대 시간(ms).
export const WORKING_MAX_MS = 90 * 1000