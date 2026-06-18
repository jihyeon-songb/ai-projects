// buildRequest 매핑 자가검증. 실행: node --experimental-strip-types src/main/bridge.test.ts
import assert from 'node:assert'
import { buildRequest, humanize, answerReason } from './bridge.ts'
import type { QuestionSpec } from './bridge.ts'

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

// --- humanize: 도구별 요약/상세 매처 ---
assert.equal(humanize('Bash', { command: 'ls' }).summary, '명령을 실행하려 해요')
assert.equal(humanize('Read', { file_path: '/a/b.ts' }).detail, '/a/b.ts')
assert.equal(humanize('WebFetch', { url: 'https://x.com' }).summary, '웹에 접근하려 해요')
// patch: 첫 비어있지 않은 줄만, 200자 컷
assert.equal(humanize('Edit', { patch: '\n  @@ hunk\n+more' }).detail, '  @@ hunk')
assert.equal(humanize('Edit', { patch: 'x'.repeat(300) }).detail.length, 200)
// 매처 없고 키만 → key:value 라인, 120자 초과 시 …
assert.ok(humanize('Weird', { a: 1, b: 'two' }).detail.includes('a: 1'))
assert.ok(humanize('Weird', { long: 'y'.repeat(200) }).detail.endsWith('…'))
// 입력 완전 비면 도구명 안내
assert.ok(humanize('Mystery', {}).detail.includes('Mystery'))
// 우선순위: command 가 file_path 보다 먼저
assert.equal(humanize('X', { command: 'go', file_path: '/z' }).detail, 'go')

// --- answerReason: 선택 답 조합 ---
const qs: QuestionSpec[] = [
  { question: 'Q1?', header: '머지 방식', options: [{ label: 'rebase' }, { label: 'merge' }] },
  { question: 'Q2?', header: '대상', options: [{ label: 'a' }, { label: 'b' }] }
]
let ar = answerReason(qs, JSON.stringify([['rebase'], ['a', 'b']]))
assert.ok(ar.includes('「머지 방식」 선택: rebase'))
assert.ok(ar.includes('「대상」 선택: a, b'))
assert.ok(ar.includes('이 선택대로 진행해줘'))
// 빈 선택 → 취소 메시지
assert.equal(answerReason(qs, JSON.stringify([[], []])), '사용자가 선택을 취소했어요.')
// 깨진 picksJson → 취소 메시지 (예외 안 던짐)
assert.equal(answerReason(qs, 'not json'), '사용자가 선택을 취소했어요.')
// questions 없음 → 취소 메시지
assert.equal(answerReason(undefined, JSON.stringify([['x']])), '사용자가 선택을 취소했어요.')

console.log('bridge.test OK')
