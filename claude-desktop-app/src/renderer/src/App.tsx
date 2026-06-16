import { useEffect, useRef, useState, useCallback } from 'react'
import Character from './components/Character'
import SpeechBubble from './components/SpeechBubble'
import type { PermissionRequest, NotifyPayload } from './types'
import { NOTICE_AUTO_HIDE_MS, WORKING_MAX_MS, type ClaudieState } from './config'

/** 세션 하나의 알림 상태. 세션 = Claude 의 session_id. */
interface SessionState {
  permissions: PermissionRequest[]
  notice: string | null
  noticeAt: number
  workingSince: number | null
  cwd?: string
}

const EMPTY: SessionState = { permissions: [], notice: null, noticeAt: 0, workingSince: null }

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** cwd 마지막 경로 조각을 세션 라벨로. 없으면 빈 문자열. */
function labelOf(cwd?: string): string {
  return cwd?.split('/').filter(Boolean).pop() ?? ''
}

const PRIORITY: Record<ClaudieState, number> = { permission: 3, done: 2, working: 1, idle: 0 }

function stateOf(s: SessionState): ClaudieState {
  if (s.permissions.length) return 'permission'
  if (s.notice !== null) return 'done'
  if (s.workingSince !== null) return 'working'
  return 'idle'
}

// ponytail: 세션별 setTimeout 대신 1초 틱 하나로 만료 정리(아래 prune). 세션 수 적어 충분.
function prune(prev: Record<string, SessionState>, t: number): Record<string, SessionState> {
  let changed = false
  const next: Record<string, SessionState> = {}
  for (const [k, s] of Object.entries(prev)) {
    let notice = s.notice
    let workingSince = s.workingSince
    if (notice !== null && NOTICE_AUTO_HIDE_MS > 0 && t - s.noticeAt > NOTICE_AUTO_HIDE_MS) {
      notice = null
      changed = true
    }
    if (workingSince !== null && WORKING_MAX_MS > 0 && t - workingSince > WORKING_MAX_MS) {
      workingSince = null
      changed = true
    }
    if (s.permissions.length === 0 && notice === null && workingSince === null) {
      changed = true // 빈 세션은 버림
      continue
    }
    next[k] = notice !== s.notice || workingSince !== s.workingSince ? { ...s, notice, workingSince } : s
  }
  return changed ? next : prev
}

export default function App() {
  const [sessions, setSessions] = useState<Record<string, SessionState>>({})
  const [now, setNow] = useState(() => Date.now())

  const patch = useCallback((key: string, fn: (s: SessionState) => SessionState) => {
    setSessions((prev) => ({ ...prev, [key]: fn(prev[key] ?? EMPTY) }))
  }, [])

  // ── Claude 이벤트 구독 ──────────────────────────────────────
  useEffect(() => {
    const offReq = window.claudie.onPermissionRequest((r: PermissionRequest) => {
      const key = r.sessionId || 'default'
      patch(key, (s) => ({
        ...s,
        cwd: r.cwd ?? s.cwd,
        workingSince: null, // 권한 묻는 동안은 멈춤
        permissions: s.permissions.some((x) => x.id === r.id) ? s.permissions : [...s.permissions, r]
      }))
    })
    const offResolved = window.claudie.onPermissionResolved((id: string) => {
      // id 는 유일 → 모든 세션에서 제거
      setSessions((prev) => {
        const next: Record<string, SessionState> = {}
        for (const [k, s] of Object.entries(prev)) {
          next[k] = { ...s, permissions: s.permissions.filter((x) => x.id !== id) }
        }
        return next
      })
    })
    const offTurn = window.claudie.onTurnComplete((p: NotifyPayload) => {
      const key = p.session_id || 'default'
      const msg = p['last-assistant-message']?.trim() || '작업을 모두 끝냈어요!'
      patch(key, (s) => ({
        ...s,
        cwd: p.cwd ?? s.cwd,
        workingSince: null,
        notice: msg,
        noticeAt: Date.now()
      }))
    })
    return () => {
      offReq()
      offResolved()
      offTurn()
    }
  }, [patch])

  // ── 1초 틱: 시간 표시 갱신 + 만료 세션 정리 ─────────────────
  useEffect(() => {
    if (Object.keys(sessions).length === 0) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      setSessions((prev) => prune(prev, t))
    }, 1000)
    return () => clearInterval(id)
  }, [sessions])

  // ── 호버 시에만 마우스 통과 끄기 ───────────────────────────
  const interactiveRef = useRef(false)
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const interactive = !!el && !!(el as Element).closest('.interactive')
      if (interactive !== interactiveRef.current) {
        interactiveRef.current = interactive
        window.claudie.setInteractive(interactive)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  const decide = useCallback(
    (key: string, id: string, decision: 'allow' | 'deny' | 'answer', payload?: string) => {
      window.claudie.decide(id, decision, payload)
      patch(key, (s) => {
        const permissions = s.permissions.filter((x) => x.id !== id)
        // 허용/답변 후 마지막 항목이면 그 세션의 클로드가 다시 작업을 시작한다.
        const resumed = decision === 'allow' || decision === 'answer'
        const workingSince =
          resumed && permissions.length === 0 ? Date.now() : s.workingSince
        return { ...s, permissions, workingSince }
      })
    },
    [patch]
  )

  const dismissNotice = useCallback(
    (key: string) => {
      patch(key, (s) => ({ ...s, notice: null }))
    },
    [patch]
  )

  // 표시할 세션(idle 제외)과 마스코트 상태(세션 중 최고 우선순위) 계산
  const entries = Object.entries(sessions)
    .map(([key, s]) => [key, s, stateOf(s)] as const)
    .filter(([, , st]) => st !== 'idle')

  let mascot: ClaudieState = 'idle'
  for (const [, , st] of entries) {
    if (PRIORITY[st] > PRIORITY[mascot]) mascot = st
  }

  return (
    <div className="stage">
      <div className="bubble-zone">
        {entries.length === 0 && <SpeechBubble variant="idle" />}
        {entries.map(([key, s, st]) => {
          const label = labelOf(s.cwd)
          if (st === 'permission') {
            const current = s.permissions[0]
            return (
              <SpeechBubble
                key={key}
                variant="permission"
                request={current}
                pending={s.permissions.length}
                label={label}
                onAllow={() => decide(key, current.id, 'allow')}
                onDeny={() => decide(key, current.id, 'deny')}
                onSubmit={(picks) => decide(key, current.id, 'answer', JSON.stringify(picks))}
              />
            )
          }
          if (st === 'done') {
            return (
              <SpeechBubble
                key={key}
                variant="done"
                message={s.notice!}
                label={label}
                onConfirm={() => dismissNotice(key)}
              />
            )
          }
          // working
          return (
            <SpeechBubble
              key={key}
              variant="working"
              label={label}
              timeStr={formatElapsed(now - s.workingSince!)}
            />
          )
        })}
      </div>
      <Character state={mascot} />
    </div>
  )
}
