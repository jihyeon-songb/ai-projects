'use strict'
// settings.json 권한 규칙(allow/deny/ask)을 읽어 PreToolUse 결정을 돕는다.
// 규칙 형식: "ToolName" 또는 "ToolName(specifier)" (Claude Code permissions 규칙).
const { readFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')

/** settings 파일 한 개에서 permissions.{allow,deny,ask} 배열을 안전하게 읽음 */
function readPerms(path) {
  try {
    const p = JSON.parse(readFileSync(path, 'utf8')).permissions || {}
    return {
      allow: Array.isArray(p.allow) ? p.allow : [],
      deny: Array.isArray(p.deny) ? p.deny : [],
      ask: Array.isArray(p.ask) ? p.ask : []
    }
  } catch {
    return { allow: [], deny: [], ask: [] } // 없거나 깨지면 무시(fail-open)
  }
}

/** user + project + project-local settings 를 머지한 규칙 */
function loadRules(cwd) {
  const files = [join(homedir(), '.claude', 'settings.json')]
  if (cwd) {
    files.push(join(cwd, '.claude', 'settings.json'))
    files.push(join(cwd, '.claude', 'settings.local.json'))
  }
  const merged = { allow: [], deny: [], ask: [] }
  for (const f of files) {
    const r = readPerms(f)
    merged.allow.push(...r.allow)
    merged.deny.push(...r.deny)
    merged.ask.push(...r.ask)
  }
  return merged
}

/** "Bash(npm install *)" → {tool:'Bash', spec:'npm install *'}; "Edit" → {tool:'Edit', spec:null} */
function parseRule(rule) {
  const m = /^([^(]+)\((.*)\)$/.exec(rule)
  if (m) return { tool: m[1].trim(), spec: m[2].trim() }
  return { tool: rule.trim(), spec: null }
}

/** 단일 규칙이 도구/입력에 매치되나 */
function ruleMatches(rule, toolName, toolInput) {
  const { tool, spec } = parseRule(rule)
  if (tool !== toolName) return false
  if (spec === null) return true // 도구 전체 매치

  // ponytail: Bash specifier 만 정밀 매칭. 그 외 도구의 specifier 규칙은 건너뜀(= 알림),
  // 형식이 다양해 과허용 위험. 수요 생기면 도구별 매처 추가.
  if (toolName !== 'Bash') return false
  const command = typeof toolInput?.command === 'string' ? toolInput.command : ''
  if (!command) return false
  const star = spec.indexOf('*')
  if (star === -1) return command === spec // 와일드카드 없으면 정확 일치
  const prefix = spec.slice(0, star).replace(/:$/, '') // "git status:*" → "git status"
  return command.startsWith(prefix)
}

const anyMatch = (rules, toolName, toolInput) =>
  rules.some((r) => ruleMatches(r, toolName, toolInput))

/** deny > ask > allow 우선. 매치 없으면 null. */
function decide(toolName, toolInput, rules) {
  if (anyMatch(rules.deny, toolName, toolInput)) return 'deny'
  if (anyMatch(rules.ask, toolName, toolInput)) return 'ask'
  if (anyMatch(rules.allow, toolName, toolInput)) return 'allow'
  return null
}

module.exports = { loadRules, decide }

if (require.main === module) {
  const assert = require('node:assert')
  const bash = (command) => ({ command })
  const rules = (o) => ({ allow: [], deny: [], ask: [], ...o })

  // allow prefix
  assert.equal(decide('Bash', bash('npm install lodash'), rules({ allow: ['Bash(npm install *)'] })), 'allow')
  // deny prefix
  assert.equal(decide('Bash', bash('rm -rf /'), rules({ deny: ['Bash(rm *)'] })), 'deny')
  // deny 가 allow 이김
  assert.equal(decide('Bash', bash('rm x'), rules({ allow: ['Bash(rm *)'], deny: ['Bash(rm *)'] })), 'deny')
  // 매치 없음 → null
  assert.equal(decide('Bash', bash('npm test'), rules({ allow: ['Bash(git *)'] })), null)
  // 정확 일치(와일드카드 없음)
  assert.equal(decide('Bash', bash('git status'), rules({ allow: ['Bash(git status)'] })), 'allow')
  assert.equal(decide('Bash', bash('git status -s'), rules({ allow: ['Bash(git status)'] })), null)
  // "cmd:*" 콜론 형식
  assert.equal(decide('Bash', bash('git status -s'), rules({ allow: ['Bash(git status:*)'] })), 'allow')
  // 도구 전체 규칙(괄호 없음)
  assert.equal(decide('Edit', { file_path: '/x' }, rules({ allow: ['Edit'] })), 'allow')
  // Bash 외 specifier → 건너뜀(null)
  assert.equal(decide('WebFetch', { url: 'http://x' }, rules({ allow: ['WebFetch(domain:x)'] })), null)
  // ask
  assert.equal(decide('Bash', bash('curl x'), rules({ ask: ['Bash(curl *)'] })), 'ask')

  console.log('permissions.js self-check OK')
}
