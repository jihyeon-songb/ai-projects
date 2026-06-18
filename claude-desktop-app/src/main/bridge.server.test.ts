// Bridge HTTP 서버 자가검증. 실행: node --experimental-strip-types src/main/bridge.server.test.ts
import assert from 'node:assert'
import http from 'node:http'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { Bridge, DISCOVERY_PATH } from './bridge.ts'
import type { PermissionRequest } from './bridge.ts'

interface Res {
  status: number
  body: any
}

/** 브릿지로 raw POST. body 가 문자열이면 그대로, 객체면 JSON.stringify. */
function request(port: number, path: string, opts: {
  method?: string
  token?: string
  body?: unknown
}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const raw = typeof opts.body === 'string' ? opts.body : opts.body == null ? '' : JSON.stringify(opts.body)
    const data = Buffer.from(raw)
    const headers: Record<string, string> = { 'content-length': String(data.length) }
    if (opts.token) headers['x-claudie-token'] = opts.token
    const req = http.request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'POST', headers },
      (res) => {
        let b = ''
        res.on('data', (c) => (b += c))
        res.on('end', () => {
          let body: any = b
          try {
            body = b ? JSON.parse(b) : ''
          } catch {
            /* 비 JSON 응답은 문자열로 */
          }
          resolve({ status: res.statusCode ?? 0, body })
        })
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function main(): Promise<void> {
  // 실사용자 디스커버리 파일을 덮어쓰지 않도록 백업/복원
  const backup = existsSync(DISCOVERY_PATH) ? readFileSync(DISCOVERY_PATH, 'utf8') : null

  const bridge = new Bridge()
  const port = await bridge.start()

  try {
    const { token } = JSON.parse(readFileSync(DISCOVERY_PATH, 'utf8'))
    assert.ok(token, 'discovery 파일에 token 기록')
    assert.ok(port > 0, '임의 포트 할당')

    // 1) 토큰 없음/틀림 → 401
    assert.equal((await request(port, '/notify', { body: {} })).status, 401)
    assert.equal((await request(port, '/notify', { token: 'wrong', body: {} })).status, 401)

    // 2) POST 아님 → 405
    assert.equal((await request(port, '/notify', { method: 'GET', token })).status, 405)

    // 3) 깨진 JSON → 400
    const bad = await request(port, '/notify', { token, body: '{not json' })
    assert.equal(bad.status, 400)

    // 4) /notify → 200 {ok:true} 그리고 'notify' 이벤트 발생
    const notifyEvent = new Promise<any>((r) => bridge.once('notify', r))
    const nres = await request(port, '/notify', { token, body: { type: 'x', cwd: '/tmp' } })
    assert.equal(nres.status, 200)
    assert.deepEqual(nres.body, { ok: true })
    assert.equal((await notifyEvent).cwd, '/tmp')

    // 5) 알 수 없는 경로 → 404
    assert.equal((await request(port, '/nope', { token, body: {} })).status, 404)

    // 6) /permission: 'permission' 이벤트 받고 deny+reason 으로 해소 → 응답에 반영
    const permEvent = new Promise<PermissionRequest>((r) => bridge.once('permission', r))
    const permResP = request(port, '/permission', {
      token,
      body: { tool_name: 'Bash', tool_input: { command: 'ls' } }
    })
    const reqObj = await permEvent
    assert.equal(reqObj.toolName, 'Bash')
    bridge.resolvePermission(reqObj.id, 'deny', '취소 사유')
    const permRes = await permResP
    assert.equal(permRes.status, 200)
    assert.deepEqual(permRes.body, { decision: 'deny', reason: '취소 사유' })

    console.log('bridge.server.test OK')
  } finally {
    bridge.stop() // DISCOVERY_PATH 삭제
    if (backup != null) writeFileSync(DISCOVERY_PATH, backup, { mode: 0o600 })
    else if (existsSync(DISCOVERY_PATH)) unlinkSync(DISCOVERY_PATH)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
