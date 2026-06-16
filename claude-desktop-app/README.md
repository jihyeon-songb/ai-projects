# 클로디 🐯 — Claude Code 컴패니언 데스크탑 캐릭터

화면 위에 떠다니는 캐릭터 **클로디**가 Claude Code와 연동됩니다.

- Claude Code가 **도구 권한을 요청**(PreToolUse)하면 클로디 옆에 `허용 / 거부` 버튼이 떠서 실제 실행을 제어합니다.
- Claude Code가 **응답을 끝내면**(Stop) 클로디가 "작업 완료!" 말풍선 + OS 알림을 띄웁니다.

> 화면의 캐릭터는 placeholder(`assets/claudie/*.png`)입니다. 실제 이미지로 바꾸려면
> [캐릭터 이미지 교체](#캐릭터-이미지-교체)를 참고하세요.

---

## 1. 구조

```
claude-desktop-app/
├─ src/
│  ├─ main/         Electron 메인: 윈도우 + 로컬 HTTP 브릿지 + IPC
│  │  ├─ bridge.ts  127.0.0.1 임의 포트 HTTP 서버, 권한 요청 보류/해소
│  │  ├─ window.ts  프레임리스·투명·always-on-top 캐릭터 윈도우
│  │  └─ index.ts   브릿지↔IPC 연결, OS 알림
│  ├─ preload/      contextBridge 로 안전한 API 노출 (window.claudie)
│  └─ renderer/     React UI (캐릭터 + 말풍선 + 허용/취소 버튼)
├─ hooks/           Claude Code 훅 스크립트 (의존성 없는 순수 Node)
│  ├─ bridge-client.js  디스커버리 파일 읽고 브릿지로 POST
│  ├─ notify.js         Stop 훅: 트랜스크립트 마지막 메시지 → 브릿지
│  └─ pre_tool_use.js   PreToolUse 훅(블로킹): 권한 요청 → 브릿지 → stdout 결정 JSON
├─ assets/claudie/*.png  캐릭터 placeholder (상태별 이미지)
└─ settings.example.json ~/.claude/settings.json hooks 예시
```

### 통신 흐름

```
Claude ──Stop(stdin)───────▶ hooks/notify.js ───POST /notify──────┐
Claude ──PreToolUse(stdin)──▶ hooks/pre_tool_use.js ─POST /permission(보류)─┤
                                                                  ▼
                                  Electron main (HTTP 브릿지, 127.0.0.1:임의포트)
                                   · 디스커버리: ~/.claude/claudie-bridge.json {port, token}
                                   · /permission 은 사용자가 버튼 누를 때까지 응답 보류
                                                                  │ IPC
                                                                  ▼
                                  Renderer: 클로디 + 말풍선 [허용][취소]
```

- **디스커버리 파일** `~/.claude/claudie-bridge.json` 에 포트·토큰이 적힙니다. 훅이 이걸 읽어 접속합니다.
- 앱이 **꺼져 있으면** 훅은 조용히 **fail-open(허용)** 으로 흘려보내 Claude를 막지 않습니다.
- 브릿지는 `127.0.0.1` 전용 + 토큰 헤더(`x-claudie-token`) 인증으로 외부 접근을 차단합니다.

---

## 2. 실행

```bash
cd claude-desktop-app
npm install
npm run dev        # 개발 모드 (클로디가 화면 우하단에 등장)
```

패키징:

```bash
npm run build      # out/ 로 번들
npm run pack       # 디렉터리 형태 앱 (electron-builder --dir)
npm run dist       # 배포용 설치 파일
```

조작:
- **드래그**: 클로디를 끌어 화면 아무 데나 이동.
- 평소엔 클릭이 **통과**하고, 캐릭터·말풍선·버튼 위에서만 클릭이 잡힙니다.

---

## 3. Claude Code 연동 설정

`<앱경로>` = 이 폴더의 절대경로 (예: `/Users/you/VSCodeProjects/codex-projects/claude-desktop-app`).

`settings.example.json` 의 `hooks` 블록을 `~/.claude/settings.json` (전역) 또는
`<repo>/.claude/settings.json` (프로젝트별)에 합치고 `<앱경로>` 를 실제 경로로 치환:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"<앱경로>/hooks/pre_tool_use.js\"",
            "timeout": 660
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"<앱경로>/hooks/notify.js\"" }
        ]
      }
    ]
  }
}
```

- **PreToolUse** = 도구 실행 직전 블로킹 훅. 클로디가 `허용/거부` 를 띄우고 결정이 올 때까지 도구를 막습니다.
  `허용` → `permissionDecision: "allow"`, `거부` → `"deny"`.
- **Stop** = 메인 에이전트가 응답을 끝냈을 때. 트랜스크립트의 마지막 assistant 메시지를 말풍선/알림으로 보여줍니다.
- `matcher` 를 `"Bash"` 처럼 좁히면 특정 도구에만 물어보게 할 수 있습니다 (정규식, `"*"` = 전체).
- `timeout`(초)은 사용자가 버튼을 누를 시간보다 넉넉히. 훅 내부 대기(10분)보다 살짝 크게 두세요.

> ℹ️ 설정을 바꾼 뒤에는 Claude Code를 재시작하거나 `/hooks` 로 다시 로드해야 적용됩니다.
> 훅 페이로드/출력 포맷은 공식 문서(https://docs.claude.com/en/docs/claude-code/hooks)를 참고하세요.

---

## 4. 동작 확인 (수용 기준)

1. `npm run dev` → 클로디가 투명 배경으로 뜨고 드래그로 이동된다.
2. 위 설정 후 Claude Code 실행. 도구 권한 요청 시 클로디 옆에 `허용/거부` 버튼이 뜬다.
3. **거부** → 해당 도구 실행이 차단된다.
4. **허용** → Claude Code가 그대로 진행한다.
5. 응답 종료 → "작업 완료!" 말풍선 + OS 알림.

앱 없이 훅만 빠르게 테스트 (둘 다 stdin 으로 페이로드를 받음):

```bash
# 권한 요청 시뮬레이션 (앱이 떠 있어야 버튼이 뜸; 꺼져 있으면 allow로 즉시 통과)
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"/tmp","tool_input":{"command":"rm -rf build/"}}' \
  | node hooks/pre_tool_use.js

# 완료 알림 시뮬레이션 (transcript_path 의 마지막 assistant 메시지를 읽음)
echo '{"hook_event_name":"Stop","cwd":"/tmp","transcript_path":"/path/to/transcript.jsonl"}' \
  | node hooks/notify.js
```

---

## 캐릭터 이미지 교체

상태별(`idle`/`working`/`permission`/`done`) 이미지를 `assets/claudie/` 에 같은 파일명으로 덮어쓰면 됩니다.
파일명을 바꾸려면 `src/renderer/src/config.ts` 의 import 경로만 수정하세요:

```ts
import idleUrl from '../../../assets/claudie/idle.png'
// working / permission / done 도 동일하게
```

> 저장소에는 자체 제작 placeholder만 포함돼 있습니다. 외부 캐릭터 이미지를 쓸 경우 저작권을 확인하세요.

## 라이선스

MIT (캐릭터 placeholder 포함).
