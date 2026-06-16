import type { PermissionRequest } from '../types'

type Props =
  | {
      variant: 'idle'
    }
  | {
      variant: 'working'
      timeStr: string
      title?: string
      detail?: string
      label?: string
    }
  | {
      variant: 'permission'
      request: PermissionRequest
      pending: number
      onAllow: () => void
      onDeny: () => void
      label?: string
    }
  | {
      variant: 'done'
      message: string
      onConfirm: () => void
      label?: string
    }

/** 세션 구분 라벨 칩 (cwd basename). 라벨 없으면 렌더 안 함. */
function SessionLabel({ label }: { label?: string }) {
  if (!label) return null
  return <div className="bubble-session-label">📁 {label}</div>
}

export default function SpeechBubble(props: Props) {
  // ── 대기 중 칩 ──────────────────────────────────────────
  if (props.variant === 'idle') {
    return (
      <div className="idle-pill interactive">
        <span className="idle-dot" />
        할 일을 기다리는 중이에욥
      </div>
    )
  }

  // ── 작업 중 카드 ────────────────────────────────────────
  if (props.variant === 'working') {
    return (
      <div className="bubble">
        <SessionLabel label={props.label} />
        <div className="work-card interactive">
          <div className="spinner" />
          <div className="work-text">
            <div className="t1">{props.title ?? '작업하고 있어욥…'}</div>
            <div className="t2">{props.detail ?? '클로드가 열일하는 중'}</div>
            <div className="work-bar">
              <i />
            </div>
          </div>
          <div className="work-timer">
            <div className="label">작업 시간</div>
            <div className="value">{props.timeStr}</div>
          </div>
        </div>
      </div>
    )
  }

  // ── 작업 완료 카드 ──────────────────────────────────────
  if (props.variant === 'done') {
    return (
      <div className="bubble">
        <SessionLabel label={props.label} />
        <div className="card interactive">
          <div className="card-head">
            <div className="card-icon check">✓</div>
            <div className="card-titles">
              <div className="card-title">작업을 완료했어요</div>
              <div className="card-sub card-sub-scroll">{props.message}</div>
            </div>
          </div>
          <div className="card-actions">
            <button className="btn btn-primary" onClick={props.onConfirm}>
              확인
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 권한 요청 카드 ──────────────────────────────────────
  const { request, pending, onAllow, onDeny } = props
  return (
    <div className="bubble">
      <SessionLabel label={props.label} />
      <div className="card interactive">
        <div className="card-head">
          <div className="card-icon">&gt;_</div>
          <div className="card-titles">
            <div className="card-title">Claude가 권한을 요청해요</div>
            <div className="card-sub">{request.summary}</div>
          </div>
          {pending > 1 && <span className="card-badge">+{pending - 1}</span>}
        </div>
        <div className="card-code">
          <span className="sigil">$</span>
          {request.detail}
        </div>
        {request.cwd && <div className="card-cwd">📁 {request.cwd}</div>}
        <div className="card-actions">
          <button className="btn btn-soft" onClick={onDeny}>
            거부
          </button>
          <button className="btn btn-primary" onClick={onAllow}>
            허용
          </button>
        </div>
      </div>
    </div>
  )
}