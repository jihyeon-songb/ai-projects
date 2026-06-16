#!/usr/bin/env node
'use strict'
// Claude Code `PreToolUse` 블로킹 훅.
// - stdin 으로 JSON 페이로드({tool_name, tool_input, cwd, ...})를 받고
// - 클로디로 권한 요청을 보낸 뒤 사용자의 허용/취소를 기다려
// - stdout 으로 결정 JSON 을 출력한다 (출력 전까지 블로킹).
//
// 앱이 꺼져 있거나 오류가 나면 "허용(fail-open)" 으로 흘려보내 Claude 를 막지 않는다.
const { post } = require('./bridge-client')

// 사용자의 응답을 기다리는 최대 시간(ms). config 의 hook timeout 보다 작게.
const WAIT_MS = 10 * 60 * 1000

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
    // stdin 이 비어있을 수 있으므로 안전장치
    setTimeout(() => resolve(data), 50).unref?.()
  })
}

/** Claude Code PreToolUse 결정 JSON. allow=권한 통과, deny=차단(+이유 모델에 전달). */
function buildOutput(decision) {
  const reason = '클로디에서 사용자가 요청을 취소했어요.'
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision === 'allow' ? 'allow' : 'deny',
      ...(decision === 'allow' ? {} : { permissionDecisionReason: reason })
    }
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj))
}

async function main() {
  const raw = await readStdin()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }
  let decision = 'allow'
  try {
    const res = await post('/permission', payload, WAIT_MS)
    decision = res && res.decision === 'deny' ? 'deny' : 'allow'
  } catch {
    decision = 'allow' // fail-open: 앱이 없거나 오류면 진행
  }

  emit(buildOutput(decision))
}

main().finally(() => process.exit(0))
