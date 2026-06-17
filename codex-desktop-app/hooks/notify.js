#!/usr/bin/env node
'use strict'
// Codex `notify` 훅: turn 완료 등 이벤트를 오랑이 브릿지로 전달한다.
// config.toml:  notify = ["node", "/<앱경로>/hooks/notify.js"]
// Codex 가 첫 번째 인자(argv[2])로 JSON 문자열을 넘긴다.
const { post } = require('./bridge-client')

async function main() {
  const arg = process.argv[2]
  if (!arg) return
  let payload
  try {
    payload = JSON.parse(arg)
  } catch {
    return
  }

  // turn 완료만 처리 (다른 이벤트는 무시)
  if (payload.type && payload.type !== 'agent-turn-complete') return

  try {
    await post('/notify', payload, 3000)
  } catch {
    // 앱이 꺼져 있으면 조용히 종료 — Codex 흐름을 막지 않는다.
  }
}

main().finally(() => process.exit(0))
