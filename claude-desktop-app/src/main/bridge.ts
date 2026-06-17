import http from 'node:http'
import { randomUUID, randomBytes } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

/** 훅이 브릿지를 찾을 수 있도록 포트/토큰을 기록하는 디스커버리 파일 */
export const DISCOVERY_PATH = join(homedir(), '.claude', 'claudie-bridge.json')

/** 사용자가 응답하지 않을 때 권한 요청 보류를 풀어주는 기본 타임아웃(ms). */
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000

export interface NotifyPayload {
  type?: string
  'last-assistant-message'?: string
  'input-messages'?: string[]
  cwd?: string
  session_id?: string
  'thread-id'?: string
  'turn-id'?: string
}

/** PreToolUse 훅이 stdin으로 받은 페이로드 (Claude 버전에 따라 필드가 가감될 수 있음) */
export interface PermissionPayload {
  session_id?: string
  cwd?: string
  hook_event_name?: string
  turn_id?: string
  tool_name?: string
  tool_use_id?: string
  tool_input?: Record<string, unknown>
  /** 훅을 띄운 터미널 (TERM_PROGRAM). 알림 클릭 시 그 앱으로 포커스. */
  term_program?: string
}

export type Decision = 'allow' | 'deny'

/** AskUserQuestion tool_input.questions 한 항목 */
export interface QuestionSpec {
  question: string
  header: string
  multiSelect?: boolean
  options: { label: string; description?: string }[]
}

export interface PermissionRequest {
  id: string
  toolName: string
  summary: string
  detail: string
  cwd?: string
  sessionId?: string
  raw: PermissionPayload
  /** 'question'=선택지 카드, 'plan'=계획 준비 알림, 'tool'=일반 허용/거부 */
  kind?: 'tool' | 'question' | 'plan'
  questions?: QuestionSpec[]
  termProgram?: string
}

interface Pending {
  resolve: (result: { decision: Decision; reason?: string }) => void
  timer: NodeJS.Timeout
}

/**
 * 로컬 전용 HTTP 브릿지.
 * - POST /notify      → 'notify' 이벤트 발생, 즉시 응답
 * - POST /permission  → 'permission' 이벤트 발생 후 사용자의 결정이 올 때까지 응답 보류
 *
 * 이벤트:
 *   bridge.on('notify', (payload: NotifyPayload) => ...)
 *   bridge.on('permission', (req: PermissionRequest) => ...)
 */
export class Bridge extends EventEmitter {
  private server: http.Server | null = null
  private token = randomBytes(24).toString('hex')
  private pending = new Map<string, Pending>()
  public port = 0

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res))
      server.on('error', reject)
      // 127.0.0.1 전용, 임의 포트(0)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') this.port = addr.port
        this.server = server
        this.writeDiscovery()
        resolve(this.port)
      })
    })
  }

  stop(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.resolve({ decision: 'allow' }) // 앱 종료 시 fail-open
    }
    this.pending.clear()
    this.server?.close()
    try {
      unlinkSync(DISCOVERY_PATH)
    } catch {
      /* ignore */
    }
  }

  /**
   * 렌더러에서 사용자가 버튼을 눌렀을 때 호출.
   * decision 'answer' = AskUserQuestion 답(picksJson) → deny + reason(조합한 답)으로 변환.
   */
  resolvePermission(id: string, decision: Decision | 'answer', payload?: string): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    if (decision === 'answer') {
      p.resolve({ decision: 'deny', reason: answerReason(this.questionsById.get(id), payload) })
      this.questionsById.delete(id)
      return
    }
    // deny + payload = 모델에 전달할 이유(예: 계획 다듬기 요청)
    if (decision === 'deny' && payload) {
      p.resolve({ decision: 'deny', reason: payload })
      return
    }
    p.resolve({ decision })
  }

  /** 질문 요청의 questions 를 id 로 보관 (답 조합 시 라벨 매핑용) */
  private questionsById = new Map<string, QuestionSpec[] | undefined>()

  private writeDiscovery(): void {
    writeFileSync(
      DISCOVERY_PATH,
      JSON.stringify({ port: this.port, token: this.token }, null, 2),
      { mode: 0o600 }
    )
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }
    if (req.headers['x-claudie-token'] !== this.token) {
      res.writeHead(401).end()
      return
    }

    let body: any
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      res.writeHead(400).end('bad json')
      return
    }

    if (req.url === '/notify') {
      this.emit('notify', body as NotifyPayload)
      json(res, 200, { ok: true })
      return
    }

    if (req.url === '/permission') {
      const request = buildRequest(body as PermissionPayload)
      // ExitPlanMode: 막지 않는다. 알림만 띄우고 즉시 통과 → 터미널 네이티브 plan UI에서 선택.
      if (request.kind === 'plan') {
        this.emit('plan-ready', request)
        json(res, 200, { decision: 'allow' })
        return
      }
      if (request.kind === 'question') this.questionsById.set(request.id, request.questions)
      const result = await new Promise<{ decision: Decision; reason?: string }>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(request.id)
          this.questionsById.delete(request.id)
          this.emit('permission-timeout', request.id)
          resolve({ decision: 'allow' }) // 무응답 시 fail-open
        }, PERMISSION_TIMEOUT_MS)
        this.pending.set(request.id, { resolve, timer })
        this.emit('permission', request)
      })
      json(res, 200, result)
      return
    }

    res.writeHead(404).end()
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: http.ServerResponse, code: number, obj: unknown): void {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json' }).end(body)
}

/** PreToolUse 페이로드를 사람이 읽을 수 있는 요청으로 변환 */
export function buildRequest(payload: PermissionPayload): PermissionRequest {
  // Claude 버전/MCP 에 따라 필드명이 다를 수 있어 폴백을 둔다.
  const p = payload as Record<string, unknown>
  const toolName =
    payload.tool_name ?? (p.tool as string) ?? (p.name as string) ?? '알 수 없는 도구'
  const input = (payload.tool_input ??
    (p.input as Record<string, unknown>) ??
    (p.arguments as Record<string, unknown>) ??
    {}) as Record<string, unknown>
  const base = {
    id: randomUUID(),
    toolName,
    cwd: payload.cwd,
    sessionId: payload.session_id,
    termProgram: payload.term_program,
    raw: payload
  }

  // AskUserQuestion: 선택지 카드로 보여준다
  if (toolName === 'AskUserQuestion') {
    const questions = parseQuestions(input.questions)
    if (questions.length) {
      return {
        ...base,
        kind: 'question',
        questions,
        summary: questions[0].question,
        detail: ''
      }
    }
  }

  // ExitPlanMode: 계획 승인 카드로 보여준다 (훅은 allow=진행 / deny=다듬기 두 결과만 가능)
  if (toolName === 'ExitPlanMode' || toolName === 'exit_plan_mode') {
    const plan = typeof input.plan === 'string' ? input.plan : ''
    return {
      ...base,
      kind: 'plan',
      summary: '계획을 다 세웠어요. 진행할까요?',
      detail: plan || '(계획 내용 없음)'
    }
  }

  const { summary, detail } = humanize(toolName, input)
  return { ...base, kind: 'tool', summary, detail }
}

/** tool_input.questions 를 안전하게 QuestionSpec[] 로 파싱 */
function parseQuestions(raw: unknown): QuestionSpec[] {
  if (!Array.isArray(raw)) return []
  const out: QuestionSpec[] = []
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue
    const opts = Array.isArray((q as any).options) ? (q as any).options : []
    const options = opts
      .map((o: any) => ({ label: String(o?.label ?? ''), description: String(o?.description ?? '') }))
      .filter((o: { label: string }) => o.label)
    if (!options.length) continue
    out.push({
      question: String((q as any).question ?? ''),
      header: String((q as any).header ?? ''),
      multiSelect: !!(q as any).multiSelect,
      options
    })
  }
  return out
}

/**
 * 렌더러가 보낸 picksJson(질문별 선택 라벨 배열) + 원본 questions 로
 * 모델에 줄 답 문자열을 만든다. deny 의 reason 으로 들어가 답으로 쓰인다.
 */
function answerReason(questions: QuestionSpec[] | undefined, picksJson?: string): string {
  let picks: string[][] = []
  try {
    picks = picksJson ? JSON.parse(picksJson) : []
  } catch {
    picks = []
  }
  const qs = questions ?? []
  const lines = qs
    .map((q, i) => {
      const chosen = (picks[i] ?? []).filter(Boolean)
      if (!chosen.length) return ''
      const head = q.header || q.question || `질문 ${i + 1}`
      return `「${head}」 선택: ${chosen.join(', ')}`
    })
    .filter(Boolean)
  if (!lines.length) return '사용자가 선택을 취소했어요.'
  return `${lines.join('\n')}\n사용자가 컴패니언에서 위와 같이 선택했어요. 이 선택대로 진행해줘.`
}

/** 도구 종류별로 말풍선에 보여줄 요약/상세를 만든다. */
function humanize(
  toolName: string,
  input: Record<string, unknown>
): { summary: string; detail: string } {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const i = input as any

  // 셸 명령
  const command = str(input.command) || str(i.cmd)
  if (command) return { summary: '명령을 실행하려 해요', detail: command }

  // 파일 다루기
  const filePath = str(input.file_path) || str(i.path) || str(i.filename) || str(i.notebook_path)
  if (filePath) return { summary: '파일을 다루려 해요', detail: filePath }

  // 패치/수정
  const patch = str(i.patch)
  if (patch) {
    const firstLine = patch.split('\n').find((l) => l.trim()) ?? patch
    return { summary: '파일을 수정하려 해요', detail: firstLine.slice(0, 200) }
  }

  // 웹 접근
  const url = str(input.url)
  if (url) return { summary: '웹에 접근하려 해요', detail: url }

  // 검색/질의/하위작업
  const query = str(input.query) || str(i.pattern) || str(i.prompt) || str(i.description)
  if (query) return { summary: `${toolName} 실행`, detail: query }

  // 그 외: input 키:값을 사람이 읽게 정리 (JSON 덤프 대신)
  const keys = Object.keys(input)
  if (keys.length) {
    const detail = keys
      .map((k) => {
        const v = (input as any)[k]
        const s = typeof v === 'string' ? v : JSON.stringify(v)
        return `${k}: ${s.length > 120 ? s.slice(0, 120) + '…' : s}`
      })
      .join('\n')
    return { summary: `${toolName} 권한을 요청해요`, detail }
  }

  // 입력이 정말 없을 때도 최소한 무슨 도구인지 알린다
  return { summary: `${toolName} 권한을 요청해요`, detail: `${toolName} 도구를 실행하려 해요` }
}
