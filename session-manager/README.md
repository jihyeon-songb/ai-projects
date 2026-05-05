# Codex Session Manager

Rust로 작성된 Codex 세션 데스크톱 뷰어입니다. macOS와 Windows에서 같은 코드로 실행되며, 저장된 세션 목록과 각 세션의 대화 내용을 한 화면에서 확인할 수 있습니다.

## 기능

- `~/.codex/sessions` 아래의 저장된 Codex 세션 자동 탐색
- `~/.codex/session_index.jsonl` 기반 세션 제목/갱신 시간 표시
- 방향키 또는 마우스로 세션 이동
- `Enter`로 선택한 세션의 대화 내용 새로 열기
- 사용자/어시스턴트/도구 메시지 중심의 대화 미리보기
- 검색어로 세션 제목, ID, 대화 내용 필터링
- macOS, Windows, Linux에서 동일한 Rust/egui UI 사용

## 실행

```sh
cargo run
```

다른 Codex 홈 경로를 쓰려면:

```sh
cargo run -- --codex-home /path/to/.codex
```

또는 세션 디렉터리를 직접 지정할 수 있습니다.

```sh
cargo run -- --sessions-dir /path/to/sessions
```

한글이 네모 문자로 보이는 환경에서는 한글 폰트 경로를 직접 지정할 수 있습니다.

```sh
CODEX_SESSION_MANAGER_KOREAN_FONT=/path/to/KoreanFont.ttf cargo run
```

## 조작

- `Up` / `Down`: 세션 목록 이동
- `Enter`: 선택한 세션 열기
- 검색창: 제목, 세션 ID, 대화 내용 필터링

## 빌드

```sh
cargo build --release
```

생성된 실행 파일은 `target/release/codex-session-manager` 또는 Windows에서 `target/release/codex-session-manager.exe`에 있습니다.
