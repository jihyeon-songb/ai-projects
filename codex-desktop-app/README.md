# 오랑이 🐯 — Codex 컴패니언 데스크탑 캐릭터

화면 위에 떠다니는 주황 호랑이 **오랑이**가 Codex CLI와 연동됩니다.

- Codex가 **권한을 요청**하면 오랑이 옆에 `허용 / 취소` 버튼이 떠서 실제 Codex 동작을 제어합니다.
- Codex **작업(turn)이 끝나면** 오랑이가 "작업 완료!" 말풍선 + OS 알림을 띄웁니다.

> 화면의 캐릭터는 placeholder(`assets/orangi.svg`)입니다. 실제 오랑이 이미지로 바꾸려면
> [캐릭터 이미지 교체](#캐릭터-이미지-교체)를 참고하세요.

---

## 1. 구조

```
codex-desktop-app/
├─ src/
│  ├─ main/         Electron 메인: 윈도우 + 로컬 HTTP 브릿지 + IPC
│  │  ├─ bridge.ts  127.0.0.1 임의 포트 HTTP 서버, 권한 요청 보류/해소
│  │  ├─ window.ts  프레임리스·투명·always-on-top 캐릭터 윈도우
│  │  └─ index.ts   브릿지↔IPC 연결, OS 알림
│  ├─ preload/      contextBridge 로 안전한 API 노출 (window.orangi)
│  └─ renderer/     React UI (캐릭터 + 말풍선 + 허용/취소 버튼)
├─ hooks/           Codex 훅 스크립트 (의존성 없는 순수 Node)
│  ├─ bridge-client.js  디스커버리 파일 읽고 브릿지로 POST
│  ├─ notify.js         turn 완료 알림 → 브릿지
│  └─ pre_tool_use.js   권한 요청(블로킹) → 브릿지 → stdout 결정 JSON
├─ assets/orangi.svg    캐릭터 placeholder
└─ hooks.example.json   ~/.codex/hooks.json 예시
```

### 통신 흐름

```
Codex ──notify(argv JSON)──▶ hooks/notify.js ───POST /notify──────┐
Codex ──PreToolUse(stdin)──▶ hooks/pre_tool_use.js ─POST /permission(보류)─┤
                                                                  ▼
                                  Electron main (HTTP 브릿지, 127.0.0.1:임의포트)
                                   · 디스커버리: ~/.codex/orangi-bridge.json {port, token}
                                   · /permission 은 사용자가 버튼 누를 때까지 응답 보류
                                                                  │ IPC
                                                                  ▼
                                  Renderer: 오랑이 + 말풍선 [허용][취소]
```

- **디스커버리 파일** `~/.codex/orangi-bridge.json` 에 포트·토큰이 적힙니다. 훅이 이걸 읽어 접속합니다.
- 앱이 **꺼져 있으면** 훅은 조용히 **fail-open(허용)** 으로 흘려보내 Codex를 막지 않습니다.
- 브릿지는 `127.0.0.1` 전용 + 토큰 헤더(`x-orangi-token`) 인증으로 외부 접근을 차단합니다.

---

## 2. 실행

```bash
cd codex-desktop-app
npm install
npm run dev        # 개발 모드 (오랑이가 화면 우하단에 등장)
```

패키징:

```bash
npm run build      # out/ 로 번들
npm run pack       # 디렉터리 형태 앱 (electron-builder --dir)
npm run dist       # 배포용 설치 파일
```

조작:
- **드래그**: 오랑이를 끌어 화면 아무 데나 이동.
- 평소엔 클릭이 **통과**하고, 캐릭터·말풍선·버튼 위에서만 클릭이 잡힙니다.

---

## 3. Codex 연동 설정

`<앱경로>` = 이 폴더의 절대경로 (예: `/Users/you/VSCodeProjects/codex-projects/codex-desktop-app`).

### (A) 작업 완료 알림 — notify

`~/.codex/config.toml` **맨 위(모든 `[table]` 보다 위)** 에 root key로 추가:

```toml
notify = ["node", "<앱경로>/hooks/notify.js"]
```

> ⚠️ TOML 특성상 `notify = [...]` 는 첫 `[section]` 헤더 **위**에 있어야 root key로 인식됩니다.
> `notify` 는 하나만 지정할 수 있으니, 기존에 다른 notify가 있으면 교체하세요.

### (B) 권한 허용/취소 — PreToolUse 훅 (블로킹)

`hooks.example.json` 을 복사해서 `~/.codex/hooks.json` (전역) 또는 `<repo>/.codex/hooks.json` (프로젝트별)로 두고 `<앱경로>` 를 치환:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"<앱경로>/hooks/pre_tool_use.js\"",
            "timeout": 660,
            "statusMessage": "오랑이에게 허용 여부 묻는 중…"
          }
        ]
      }
    ]
  }
}
```

또는 `~/.codex/config.toml` 에 인라인으로:

```toml
[[hooks.PreToolUse]]
matcher = ".*"

[[hooks.PreToolUse.hooks]]
type = "command"
command = 'node "<앱경로>/hooks/pre_tool_use.js"'
timeout = 660
statusMessage = "오랑이에게 허용 여부 묻는 중…"
```

- `matcher` 를 `^Bash$` 처럼 좁히면 특정 도구에만 물어보게 할 수 있습니다.
- `timeout` 은 사용자가 버튼을 누를 시간보다 넉넉히. 훅 내부 대기(10분)보다 살짝 크게 두세요.

> ℹ️ Codex 훅 API는 버전에 따라 이벤트 이름(`PreToolUse` / `PermissionRequest`)과 stdout 결정 포맷이
> 다를 수 있습니다. `hooks/pre_tool_use.js` 는 stdin 페이로드의 `hook_event_name` 을 보고
> **양쪽 포맷을 모두 출력**하도록 작성돼 있어 어느 버전이든 차단/허용이 먹습니다.
> 동작이 이상하면 최신 문서(https://developers.openai.com/codex/hooks)와 대조해
> `buildOutput()` 만 조정하면 됩니다.

---

## 4. 동작 확인 (수용 기준)

1. `npm run dev` → 오랑이가 투명 배경으로 뜨고 드래그로 이동된다.
2. 위 (A)(B) 설정 후 Codex 실행. 권한 요청 시 오랑이 옆에 `허용/취소` 버튼이 뜬다.
3. **취소** → 해당 도구 실행이 차단된다.
4. **허용** → Codex가 그대로 진행한다.
5. turn 종료 → "작업 완료!" 말풍선 + OS 알림.

앱 없이 훅만 빠르게 테스트:

```bash
# 권한 요청 시뮬레이션 (앱이 떠 있어야 버튼이 뜸; 꺼져 있으면 allow로 즉시 통과)
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"/tmp","tool_input":{"command":"rm -rf build/"}}' \
  | node hooks/pre_tool_use.js

# 완료 알림 시뮬레이션
node hooks/notify.js '{"type":"agent-turn-complete","last-assistant-message":"빌드 통과했어요!","cwd":"/tmp"}'
```

---

## 캐릭터 이미지 교체

1. `assets/` 에 실제 이미지(예: `orangi.png`)를 넣습니다.
2. `src/renderer/src/config.ts` 의 import 경로만 바꿉니다:

   ```ts
   import orangiUrl from '../../../assets/orangi.png'
   export const CHARACTER_IMAGE: string = orangiUrl
   ```

> 참고한 카카오 이모티콘 "오랑이"는 저작권이 있으므로, 개인적으로 내려받은 이미지를
> 직접 넣어 사용하세요. 저장소에는 자체 제작 placeholder만 포함돼 있습니다.

## 라이선스

MIT (캐릭터 placeholder 포함). 외부 이모티콘 이미지의 저작권은 각 권리자에게 있습니다.
