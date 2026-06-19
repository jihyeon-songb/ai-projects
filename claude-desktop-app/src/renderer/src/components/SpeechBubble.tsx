import { useState } from 'react'
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
      /** AskUserQuestion 답: 질문별 선택 라벨 배열 */
      onSubmit: (picks: string[][]) => void
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

  // ── AskUserQuestion 선택지 카드 ─────────────────────────
  if (props.request.kind === 'question' && props.request.questions?.length) {
    return (
      <div className="bubble">
        <SessionLabel label={props.label} />
        <QuestionCard
          request={props.request}
          pending={props.pending}
          onSubmit={props.onSubmit}
          onDeny={props.onDeny}
        />
      </div>
    )
  }

  // ── ExitPlanMode 계획 승인 카드 ─────────────────────────
  if (props.request.kind === 'plan') {
    const { request, pending, onAllow, onDeny } = props
    return (
      <div className="bubble">
        <SessionLabel label={props.label} />
        <div className="card interactive">
          <div className="card-head">
            <div className="card-icon">▶</div>
            <div className="card-titles">
              <div className="card-title">Claude가 계획을 다 세웠어요</div>
              <div className="card-sub">진행할까요?</div>
            </div>
            {pending > 1 && <span className="card-badge">+{pending - 1}</span>}
          </div>
          <div className="card-code">{request.detail}</div>
          <div className="question-options">
            <button className="option" onClick={onAllow}>
              <span className="option-label">응, 이대로 진행해</span>
              <span className="option-desc">계획을 실행해요</span>
            </button>
            <button className="option" onClick={onDeny}>
              <span className="option-label">아니, 더 다듬어줘</span>
              <span className="option-desc">계획 모드 유지하고 수정해요</span>
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

/** AskUserQuestion 선택지 폼. 질문별로 옵션을 고르고 '보내기'로 제출. */
function QuestionCard({
  request,
  pending,
  onSubmit,
  onDeny
}: {
  request: PermissionRequest
  pending: number
  onSubmit: (picks: string[][]) => void
  onDeny: () => void
}) {
  const questions = request.questions ?? []
  // picks[i] = i번째 질문에서 고른 라벨들
  const [picks, setPicks] = useState<string[][]>(() => questions.map(() => []))

  const toggle = (qi: number, label: string, multi: boolean): void => {
    setPicks((prev) => {
      const next = prev.map((a) => [...a])
      const cur = next[qi]
      if (multi) {
        const at = cur.indexOf(label)
        if (at >= 0) cur.splice(at, 1)
        else cur.push(label)
      } else {
        next[qi] = cur[0] === label ? [] : [label]
      }
      return next
    })
  }

  const ready = questions.every((_, i) => picks[i]?.length > 0)

  return (
    <div className="card interactive">
      <div className="card-head">
        <div className="card-icon">?</div>
        <div className="card-titles">
          <div className="card-title">Claude가 선택지를 물어봐요</div>
          <div className="card-sub">{questions.length}개 질문</div>
        </div>
        {pending > 1 && <span className="card-badge">+{pending - 1}</span>}
      </div>

      <div className="question-scroll">
        {questions.map((q, qi) => (
          <div className="question" key={qi}>
            <div className="question-text">{q.question || q.header}</div>
            <div className="question-options">
              {q.options.map((o) => {
                const selected = picks[qi]?.includes(o.label)
                return (
                  <button
                    key={o.label}
                    className={`option${selected ? ' option-selected' : ''}`}
                    onClick={() => toggle(qi, o.label, !!q.multiSelect)}
                  >
                    <span className="option-label">{o.label}</span>
                    {o.description && <span className="option-desc">{o.description}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card-actions">
        <button className="btn btn-soft" onClick={onDeny}>
          취소
        </button>
        <button className="btn btn-primary" disabled={!ready} onClick={() => onSubmit(picks)}>
          보내기
        </button>
      </div>
    </div>
  )
}