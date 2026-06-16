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
}

export type Decision = 'allow' | 'deny'

export interface PermissionRequest {
  id: string
  toolName: string
  summary: string
  detail: string
  cwd?: string
  sessionId?: string
  raw: PermissionPayload
}

interface Pending {
  resolve: (decision: Decision) => void
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
      p.resolve('allow') // 앱 종료 시 fail-open
    }
    this.pending.clear()
    this.server?.close()
    try {
      unlinkSync(DISCOVERY_PATH)
    } catch {
      /* ignore */
    }
  }

  /** 렌더러에서 사용자가 버튼을 눌렀을 때 호출 */
  resolvePermission(id: string, decision: Decision): void {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    p.resolve(decision)
  }

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
      const decision = await new Promise<Decision>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(request.id)
          this.emit('permission-timeout', request.id)
          resolve('allow') // 무응답 시 fail-open
        }, PERMISSION_TIMEOUT_MS)
        this.pending.set(request.id, { resolve, timer })
        this.emit('permission', request)
      })
      json(res, 200, { decision })
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
function buildRequest(payload: PermissionPayload): PermissionRequest {
  const toolName = payload.tool_name ?? 'unknown'
  const input = payload.tool_input ?? {}
  const { summary, detail } = humanize(toolName, input)
  return {
    id: randomUUID(),
    toolName,
    summary,
    detail,
    cwd: payload.cwd,
    sessionId: payload.session_id,
    raw: payload
  }
}

/** 도구 종류별로 말풍선에 보여줄 요약/상세를 만든다. */
function humanize(
  toolName: string,
  input: Record<string, unknown>
): { summary: string; detail: string } {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')

  // 셸 명령
  const command = str(input.command) || str((input as any).cmd)
  if (command) {
    return { summary: `명령을 실행하려 해요`, detail: command }
  }

  // 파일 수정/패치
  const filePath =
    str(input.file_path) || str((input as any).path) || str((input as any).filename)
  if (filePath) {
    return { summary: `파일을 수정하려 해요`, detail: filePath }
  }
  const patch = str((input as any).patch) || str((input as any).input)
  if (patch) {
    const firstLine = patch.split('\n').find((l) => l.trim()) ?? patch
    return { summary: `파일을 수정하려 해요`, detail: firstLine.slice(0, 200) }
  }

  // 그 외: 입력을 통째로 보여줌
  const detail = Object.keys(input).length ? JSON.stringify(input, null, 2) : '(상세 정보 없음)'
  return { summary: `${toolName} 권한을 요청해요`, detail }
}
