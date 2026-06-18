# Vibe Diary — Code Review Dashboard

코드 리뷰 결과(JSON)를 불러와 보여주는 단일 페이지 대시보드. 빌드·의존성 없음, 순수 HTML/CSS/JS.

## 실행

```bash
open index.html        # macOS
# 또는 정적 서버
python3 -m http.server
```

브라우저에서 `index.html`을 열면 내장된 샘플 리뷰(`app.js`의 `defaultReview`)가 바로 렌더링된다.

## 사용

- **JSON 버튼** — 리뷰 결과 JSON 파일을 업로드해 화면을 교체.
- **심각도 탭** — critical/high/medium/low/info 별로 finding 필터.
- **파일 목록** — 사이드바에서 리뷰된 파일 선택.
- **Reset** — 기본 샘플 리뷰로 되돌림.

## JSON 형식

`code_review.json`이 전체 스키마(JSON Schema). 핵심 구조:

```jsonc
{
  "reviewId": "review_20260505_001",
  "status": "needs_changes",          // passed | needs_changes | failed | ...
  "summary":  { "title", "overview", "riskLevel", "recommendation" },
  "metrics":  { "score", "filesReviewed", "findingsTotal", "findingsBySeverity" },
  "findings": [
    {
      "id": "F-001",
      "severity": "high",             // critical | high | medium | low | info
      "category": "bug",
      "title", "message",
      "location":   { "file", "line", "column", "snippet" },
      "impact",
      "suggestion": { "description", "patch" },
      "display":    { "priority", "isBlocking", "badgeLabel", "collapsedByDefault" }
    }
  ],
  "reviewedAt": "..."
}
```

누락된 필드는 `app.js`의 `normalizeReview()`가 기본값으로 채운다(예: `findingsBySeverity`는 findings에서 자동 집계).

## 파일

| 파일 | 역할 |
|------|------|
| `index.html` | 레이아웃·DOM 구조 |
| `styles.css` | 스타일 |
| `app.js` | 렌더링·필터·파일 로드 로직, 샘플 데이터 |
| `code_review.json` | 입력 JSON 스키마 |
