#!/usr/bin/env node
'use strict'
// Codex `PreToolUse`(또는 PermissionRequest) 블로킹 훅.
// - stdin 으로 JSON 페이로드를 받고
// - 오랑이로 권한 요청을 보낸 뒤 사용자의 허용/취소를 기다려
// - stdout 으로 결정 JSON 을 출력한다 (출력 전까지 블로킹).
//
// 앱이 꺼져 있거나 오류가 나면 "허용(fail-open)" 으로 흘려보내 Codex 를 막지 않는다.
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

/** Codex 버전별 응답 포맷을 모두 커버하는 결정 JSON 을 만든다. */
function buildOutput(eventName, decision) {
  const allow = decision === 'allow'
  const reason = '오랑이에서 사용자가 요청을 취소했어요.'

  if (eventName === 'PermissionRequest') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: allow ? { behavior: 'allow' } : { behavior: 'deny', message: reason }
      }
    }
  }

  // PreToolUse (기본)
  if (allow) {
    return {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' }
    }
  }
  return {
    // 신규 + 레거시(block) 포맷 동시 출력 → 어떤 버전이든 차단되게
    decision: 'block',
    reason,
    continue: false,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
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
  const eventName = payload.hook_event_name || 'PreToolUse'

  let decision = 'allow'
  try {
    const res = await post('/permission', payload, WAIT_MS)
    decision = res && res.decision === 'deny' ? 'deny' : 'allow'
  } catch {
    decision = 'allow' // fail-open: 앱이 없거나 오류면 진행
  }

  emit(buildOutput(eventName, decision))
}

main().finally(() => process.exit(0))
