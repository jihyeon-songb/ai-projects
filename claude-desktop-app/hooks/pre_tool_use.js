#!/usr/bin/env node
'use strict'
// Claude Code `PreToolUse` 블로킹 훅.
// - stdin 으로 JSON 페이로드({tool_name, tool_input, cwd, ...})를 받고
// - 클로디로 권한 요청을 보낸 뒤 사용자의 허용/취소를 기다려
// - stdout 으로 결정 JSON 을 출력한다 (출력 전까지 블로킹).
//
// 앱이 꺼져 있거나 오류가 나면 "허용(fail-open)" 으로 흘려보내 Claude 를 막지 않는다.
const { post } = require('./bridge-client')
const { loadRules, decide } = require('./permissions')

// 사용자의 응답을 기다리는 최대 시간(ms). config 의 hook timeout 보다 작게.
const WAIT_MS = 10 * 60 * 1000

// 카드로 물어볼 도구 = "내가 골라야 하는" 요청뿐.
// 그 외 모든 도구(Bash·Read·Edit·WebFetch·MCP·미지 도구…)는 카드 안 띄우고 조용히 통과.
// 위험 명령은 settings deny 규칙으로 막을 것. 사용자가 ask 규칙을 두면 그것도 카드로 뜸.
const CARD_TOOLS = new Set(['ExitPlanMode', 'exit_plan_mode', 'AskUserQuestion'])

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

/**
 * Claude Code PreToolUse 결정 JSON. allow=권한 통과, deny=차단(+이유 모델에 전달).
 * reason 이 오면(예: AskUserQuestion 답) 그걸 모델에 전달하는 이유로 쓴다.
 */
function buildOutput(decision, reason) {
  const text = reason || '클로디에서 사용자가 요청을 취소했어요.'
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision === 'allow' ? 'allow' : 'deny',
      ...(decision === 'allow' ? {} : { permissionDecisionReason: text })
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
  // settings.json 권한 규칙(allow/deny/ask) 존중. 터미널이 안 묻는 건 알림도 안 띄움.
  const verdict = decide(payload.tool_name, payload.tool_input, loadRules(payload.cwd))
  if (verdict === 'deny') {
    emit(buildOutput('deny'))
    return
  }
  // Auto-Accept(shift+Tab) / bypass 모드면 터미널이 아무것도 안 물어봄 → 컴패니언도 조용히 통과.
  // (deny 규칙은 위에서 이미 존중함.)
  const mode = payload.permission_mode
  if (mode === 'auto' || mode === 'bypassPermissions') {
    emit(buildOutput('allow'))
    return
  }
  if (verdict === 'allow') {
    emit(buildOutput('allow'))
    return
  }
  // ask 규칙이 아니고 카드 대상 도구도 아니면 조용히 통과 (앱이 꺼져 있어도 동작).
  if (verdict !== 'ask' && !CARD_TOOLS.has(payload.tool_name)) {
    emit(buildOutput('allow'))
    return
  }
  // ask 규칙이거나 카드 대상 도구(ExitPlanMode·AskUserQuestion) → 아래 브릿지 카드 경로.

  // 어느 터미널에서 떴는지(클릭 시 그 창으로 포커스하려고). 없으면 undefined.
  payload.term_program = process.env.TERM_PROGRAM

  let decision = 'allow'
  let reason
  try {
    const res = await post('/permission', payload, WAIT_MS)
    decision = res && res.decision === 'deny' ? 'deny' : 'allow'
    reason = res && res.reason
  } catch {
    decision = 'allow' // fail-open: 앱이 없거나 오류면 진행
  }

  emit(buildOutput(decision, reason))
}

main().finally(() => process.exit(0))
