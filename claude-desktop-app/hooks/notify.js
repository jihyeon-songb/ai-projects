#!/usr/bin/env node
'use strict'
// Claude Code `Stop` 훅: 메인 에이전트가 응답을 끝내면 클로디 브릿지로 알린다.
// settings.json:  "Stop": [{ "hooks": [{ "type": "command",
//                   "command": "node \"<앱경로>/hooks/notify.js\"" }] }]
// Claude Code 가 stdin 으로 JSON({session_id, transcript_path, cwd, ...})을 넘긴다.
const fs = require('node:fs')
const { post } = require('./bridge-client')

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
    setTimeout(() => resolve(data), 50).unref?.()
  })
}

/** 트랜스크립트(JSONL)에서 마지막 assistant 텍스트를 뽑는다. 없으면 ''. */
function lastAssistantMessage(transcriptPath) {
  if (!transcriptPath) return ''
  let lines
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n')
  } catch {
    return ''
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) continue
    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    const msg = obj && obj.message
    if (!msg || msg.role !== 'assistant') continue
    const content = msg.content
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .filter((b) => b && b.type === 'text' && b.text)
              .map((b) => b.text)
              .join('\n')
          : ''
    if (text.trim()) return text.trim()
  }
  return ''
}

async function main() {
  const raw = await readStdin()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  try {
    await post(
      '/notify',
      {
        type: 'agent-turn-complete',
        'last-assistant-message': lastAssistantMessage(payload.transcript_path),
        cwd: payload.cwd,
        session_id: payload.session_id
      },
      3000
    )
  } catch {
    // 앱이 꺼져 있으면 조용히 종료 — Claude 흐름을 막지 않는다.
  }
}

if (require.main === module && process.argv[2] === '--test') {
  selfTest()
} else {
  main().finally(() => process.exit(0))
}

module.exports = { lastAssistantMessage }

/** lastAssistantMessage 자가검증. 실행: node hooks/notify.js --test */
function selfTest() {
  const assert = require('node:assert')
  const os = require('node:os')
  const path = require('node:path')
  const tmp = path.join(os.tmpdir(), `claudie-notify-test-${process.pid}.jsonl`)
  const write = (lines) => fs.writeFileSync(tmp, lines.join('\n'))
  try {
    // 1) 마지막 assistant 텍스트(배열 content)를 뒤에서부터 찾는다
    write([
      JSON.stringify({ message: { role: 'user', content: 'hi' } }),
      JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: '첫 답' }] } }),
      JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: '마지막 답' }] } })
    ])
    assert.equal(lastAssistantMessage(tmp), '마지막 답')

    // 2) 문자열 content 도 지원
    write([JSON.stringify({ message: { role: 'assistant', content: '문자열 답' } })])
    assert.equal(lastAssistantMessage(tmp), '문자열 답')

    // 3) tool_use 만 있고 텍스트 없는 마지막 턴은 건너뛰고 이전 텍스트 사용
    write([
      JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: '이전 텍스트' }] } }),
      JSON.stringify({ message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }] } })
    ])
    assert.equal(lastAssistantMessage(tmp), '이전 텍스트')

    // 4) 깨진 JSON 라인/빈 줄은 무시
    write(['', 'not json', JSON.stringify({ message: { role: 'assistant', content: '견고함' } }), ''])
    assert.equal(lastAssistantMessage(tmp), '견고함')

    // 5) assistant 메시지 없으면 ''
    write([JSON.stringify({ message: { role: 'user', content: 'hi' } })])
    assert.equal(lastAssistantMessage(tmp), '')

    // 6) 경로 없음/없는 파일 → ''  (예외 안 던짐)
    assert.equal(lastAssistantMessage(''), '')
    assert.equal(lastAssistantMessage('/no/such/file.jsonl'), '')

    console.log('notify.js self-check OK')
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}