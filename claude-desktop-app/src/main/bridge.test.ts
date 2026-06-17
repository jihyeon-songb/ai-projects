// buildRequest 매핑 자가검증. 실행: node --experimental-strip-types src/main/bridge.test.ts
import assert from 'node:assert'
import { buildRequest } from './bridge.ts'

// 1) Bash: 명령 노출
let r = buildRequest({ tool_name: 'Bash', tool_input: { command: 'ls -al' } })
assert.equal(r.detail, 'ls -al')
assert.equal(r.kind, 'tool')

// 2) 빈 입력 + 이름 없음 → "(상세 정보 없음)" 금지, 도구명 안내
r = buildRequest({})
assert.equal(r.toolName, '알 수 없는 도구')
assert.ok(!r.detail.includes('상세 정보 없음'), 'must not show 상세 정보 없음')
assert.ok(r.detail.includes('알 수 없는 도구'))

// 3) 필드명 변형(tool/arguments) 폴백
r = buildRequest({ tool: 'WebFetch', arguments: { url: 'https://x.com' } } as any)
assert.equal(r.toolName, 'WebFetch')
assert.equal(r.detail, 'https://x.com')

// 4) MCP/미지 도구 + 입력 있음 → key:value 정리, JSON 덤프 아님
r = buildRequest({ tool_name: 'mcp__notion__search', tool_input: { query: '회의록' } })
assert.equal(r.detail, '회의록')

// 5) 입력 키만 있고 매처 없음 → key:value 라인
r = buildRequest({ tool_name: 'Weird', tool_input: { foo: 'bar', n: 3 } })
assert.ok(r.detail.includes('foo: bar') && r.detail.includes('n: 3'))

// 6) ExitPlanMode → plan kind
r = buildRequest({ tool_name: 'ExitPlanMode', tool_input: { plan: 'do it' } })
assert.equal(r.kind, 'plan')

console.log('bridge.test OK')
