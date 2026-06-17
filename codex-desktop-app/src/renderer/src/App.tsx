import { useEffect, useRef, useState, useCallback } from 'react'
import Character from './components/Character'
import SpeechBubble from './components/SpeechBubble'
import type { PermissionRequest, NotifyPayload } from './types'
import { NOTICE_AUTO_HIDE_MS, WORKING_MAX_MS, type CodemongState } from './config'

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function App() {
  const [queue, setQueue] = useState<PermissionRequest[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [workingSince, setWorkingSince] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = queue[0] ?? null

  const stopWorking = useCallback(() => {
    if (workingTimer.current) clearTimeout(workingTimer.current)
    workingTimer.current = null
    setWorkingSince(null)
  }, [])

  const startWorking = useCallback(() => {
    setWorkingSince(Date.now())
    if (workingTimer.current) clearTimeout(workingTimer.current)
    if (WORKING_MAX_MS > 0) {
      workingTimer.current = setTimeout(() => setWorkingSince(null), WORKING_MAX_MS)
    }
  }, [])

  // ── Codex 이벤트 구독 ──────────────────────────────────────
  useEffect(() => {
    const offReq = window.orangi.onPermissionRequest((r: PermissionRequest) => {
      stopWorking() // 권한을 물어보는 동안은 작업이 멈춘 상태
      setQueue((q) => (q.some((x) => x.id === r.id) ? q : [...q, r]))
    })
    const offResolved = window.orangi.onPermissionResolved((id: string) => {
      setQueue((q) => q.filter((x) => x.id !== id))
    })
    const offTurn = window.orangi.onTurnComplete((p: NotifyPayload) => {
      stopWorking()
      const msg = p['last-assistant-message']?.trim() || '작업을 모두 끝냈어요!'
      setNotice(msg)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      if (NOTICE_AUTO_HIDE_MS > 0) {
        noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_AUTO_HIDE_MS)
      }
    })
    return () => {
      offReq()
      offResolved()
      offTurn()
    }
  }, [stopWorking])

  // ── 작업 시간 타이머(1초마다 갱신) ─────────────────────────
  useEffect(() => {
    if (workingSince === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [workingSince])

  // ── 호버 시에만 마우스 통과 끄기 ───────────────────────────
  const interactiveRef = useRef(false)
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const interactive = !!el && !!(el as Element).closest('.interactive')
      if (interactive !== interactiveRef.current) {
        interactiveRef.current = interactive
        window.orangi.setInteractive(interactive)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  const decide = useCallback(
    (id: string, decision: 'allow' | 'deny') => {
      window.orangi.decide(id, decision)
      setQueue((q) => q.filter((x) => x.id !== id))
      // 마지막 권한을 허용했다면 코덱스가 다시 작업을 시작합니다.
      if (decision === 'allow' && queue.length <= 1) startWorking()
    },
    [queue.length, startWorking]
  )

  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(null)
  }, [])

  // ── 현재 상태 결정 (우선순위: 권한 > 완료 > 작업 > 대기) ──
  let state: CodemongState = 'idle'
  if (current) state = 'permission'
  else if (notice !== null) state = 'done'
  else if (workingSince !== null) state = 'working'

  return (
    <div className="stage">
      <div className="bubble-zone">
        {state === 'permission' && current && (
          <SpeechBubble
            variant="permission"
            request={current}
            pending={queue.length}
            onAllow={() => decide(current.id, 'allow')}
            onDeny={() => decide(current.id, 'deny')}
          />
        )}
        {state === 'done' && (
          <SpeechBubble variant="done" message={notice!} onConfirm={dismissNotice} />
        )}
        {state === 'working' && (
          <SpeechBubble variant="working" timeStr={formatElapsed(now - workingSince!)} />
        )}
        {state === 'idle' && <SpeechBubble variant="idle" />}
      </div>
      <Character state={state} />
    </div>
  )
}