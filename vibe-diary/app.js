const defaultReview = {
  reviewId: "review_20260505_001",
  status: "needs_changes",
  summary: {
    title: "Vibe Diary code review",
    overview:
      "리뷰 결과 화면에 필요한 데이터 구조는 명확하지만, 실제 리뷰 데이터를 연결할 때 파일별 상태와 차단 이슈를 먼저 확인해야 합니다.",
    riskLevel: "medium",
    recommendation: "request_changes",
  },
  metrics: {
    score: 76,
    filesReviewed: 5,
    findingsTotal: 4,
    findingsBySeverity: {
      critical: 0,
      high: 1,
      medium: 2,
      low: 1,
      info: 0,
    },
  },
  findings: [
    {
      id: "F-001",
      severity: "high",
      category: "bug",
      title: "빈 리뷰 결과에서 첫 번째 항목 접근 가능성",
      message:
        "리뷰 결과가 비어 있을 때 첫 번째 finding을 바로 선택하면 undefined 값을 참조할 수 있습니다.",
      location: {
        file: "src/review/renderReview.ts",
        line: 42,
        column: 17,
        snippet: "const selectedFinding = findings[0];",
      },
      impact:
        "리뷰가 정상적으로 완료됐지만 이슈가 없는 PR에서 화면이 비어 있거나 런타임 오류가 발생할 수 있습니다.",
      suggestion: {
        description:
          "findings.length를 먼저 확인하고, 이슈가 없을 때는 별도 empty state를 렌더링하세요.",
        patch:
          "if (!findings.length) {\n  return renderEmptyReviewState();\n}\n\nconst selectedFinding = findings[0];",
      },
      display: {
        priority: 1,
        isBlocking: true,
        badgeLabel: "Runtime",
        collapsedByDefault: false,
      },
    },
    {
      id: "F-002",
      severity: "medium",
      category: "test",
      title: "심각도별 카운트 검증 누락",
      message:
        "findingsTotal과 findingsBySeverity 합계가 일치하는지 확인하는 테스트가 없습니다.",
      location: {
        file: "tests/reviewSummary.test.ts",
        line: 18,
        snippet: "expect(summary.findingsTotal).toBe(3);",
      },
      impact:
        "카운터와 필터 탭의 숫자가 달라져 사용자가 리뷰 상태를 잘못 판단할 수 있습니다.",
      suggestion: {
        description:
          "심각도별 합계와 전체 finding 수가 같은지 확인하는 단위 테스트를 추가하세요.",
      },
      display: {
        priority: 2,
        isBlocking: false,
        badgeLabel: "Coverage",
        collapsedByDefault: false,
      },
    },
    {
      id: "F-003",
      severity: "medium",
      category: "accessibility",
      title: "필터 탭의 선택 상태 전달 부족",
      message:
        "필터 버튼이 시각적으로만 선택 상태를 표시하고 보조 기술에 현재 상태를 전달하지 않습니다.",
      location: {
        file: "src/components/ReviewFilters.tsx",
        line: 27,
        column: 9,
        snippet: "<button className={active ? 'active' : ''}>High</button>",
      },
      impact:
        "키보드와 스크린 리더 사용자가 현재 적용된 필터를 파악하기 어렵습니다.",
      suggestion: {
        description:
          "role, aria-selected, aria-controls를 연결하거나 토글 버튼 패턴에 맞게 aria-pressed를 사용하세요.",
        patch:
          "<button\n  role=\"tab\"\n  aria-selected={active}\n  className={active ? 'active' : ''}\n>\n  High\n</button>",
      },
      display: {
        priority: 3,
        isBlocking: false,
        badgeLabel: "A11y",
        collapsedByDefault: false,
      },
    },
    {
      id: "F-004",
      severity: "low",
      category: "maintainability",
      title: "상태 라벨 매핑 중복",
      message:
        "상태, 권고, 심각도 라벨을 여러 컴포넌트에서 각각 매핑하고 있어 변경 시 누락 위험이 있습니다.",
      location: {
        file: "src/review/labels.ts",
        line: 11,
        snippet: "const statusLabels = { needs_changes: 'Needs changes' };",
      },
      impact:
        "새 상태가 추가될 때 화면마다 다른 라벨이 표시될 수 있습니다.",
      suggestion: {
        description:
          "공통 라벨 맵을 한 파일에서 export하고 화면 컴포넌트가 같은 값을 사용하도록 정리하세요.",
      },
      display: {
        priority: 4,
        isBlocking: false,
        badgeLabel: "Cleanup",
        collapsedByDefault: false,
      },
    },
  ],
  reviewedFiles: [
    {
      file: "src/review/renderReview.ts",
      status: "has_findings",
      findingCount: 1,
    },
    {
      file: "tests/reviewSummary.test.ts",
      status: "has_findings",
      findingCount: 1,
    },
    {
      file: "src/components/ReviewFilters.tsx",
      status: "has_findings",
      findingCount: 1,
    },
    {
      file: "src/review/labels.ts",
      status: "has_findings",
      findingCount: 1,
    },
    {
      file: "src/components/ReviewHeader.tsx",
      status: "clean",
      findingCount: 0,
    },
  ],
  actions: [
    {
      label: "빈 findings 배열에 대한 empty state 처리",
      type: "fix",
      findingId: "F-001",
    },
    {
      label: "심각도 카운트 합계 테스트 추가",
      type: "test",
      findingId: "F-002",
    },
    {
      label: "필터 탭 ARIA 상태 보강",
      type: "fix",
      findingId: "F-003",
    },
  ],
  reviewedAt: "2026-05-05T18:20:00+09:00",
};

const labels = {
  statuses: {
    passed: "Passed",
    needs_changes: "Needs changes",
    failed: "Failed",
    in_progress: "In progress",
  },
  risks: {
    low: "Low risk",
    medium: "Medium risk",
    high: "High risk",
    critical: "Critical risk",
  },
  recommendations: {
    approve: "Approve",
    approve_with_comments: "Approve with comments",
    request_changes: "Request changes",
    block_merge: "Block merge",
  },
  severities: {
    all: "All",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
  },
  fileStatuses: {
    clean: "Clean",
    has_findings: "Findings",
    skipped: "Skipped",
  },
};

let review = structuredClone(defaultReview);
let activeSeverity = "all";
let selectedFindingId = "";

const nodes = {
  title: document.querySelector("#review-title"),
  overview: document.querySelector("#review-overview"),
  statusBadge: document.querySelector("#status-badge"),
  riskBadge: document.querySelector("#risk-badge"),
  recommendation: document.querySelector("#recommendation-label"),
  metricScore: document.querySelector("#metric-score"),
  metricFiles: document.querySelector("#metric-files"),
  metricFindings: document.querySelector("#metric-findings"),
  metricDate: document.querySelector("#metric-date"),
  severityTotal: document.querySelector("#severity-total"),
  severityBars: document.querySelector("#severity-bars"),
  fileList: document.querySelector("#file-list"),
  fileCount: document.querySelector("#file-count"),
  filterTabs: document.querySelector("#filter-tabs"),
  findingsList: document.querySelector("#findings-list"),
  visibleFindingsCount: document.querySelector("#visible-findings-count"),
  actionList: document.querySelector("#action-list"),
  actionCount: document.querySelector("#action-count"),
  jsonInput: document.querySelector("#json-input"),
  resetButton: document.querySelector("#reset-button"),
  detailSeverity: document.querySelector("#detail-severity"),
  detailTitle: document.querySelector("#detail-title"),
  detailCategory: document.querySelector("#detail-category"),
  detailLocation: document.querySelector("#detail-location"),
  detailBlocking: document.querySelector("#detail-blocking"),
  detailMessage: document.querySelector("#detail-message"),
  detailImpact: document.querySelector("#detail-impact"),
  detailSuggestion: document.querySelector("#detail-suggestion"),
  detailPatch: document.querySelector("#detail-patch"),
  detailSnippet: document.querySelector("#detail-snippet"),
};

function badgeClass(value) {
  return `badge badge-${value}`;
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function findingLocation(finding) {
  const { file, line, column } = finding.location;
  return `${file}:${line}${column ? `:${column}` : ""}`;
}

function normalizeReview(data) {
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const reviewedFiles = Array.isArray(data.reviewedFiles) ? data.reviewedFiles : [];
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const counts = data.metrics?.findingsBySeverity ?? {};

  return {
    reviewId: data.reviewId ?? "review_unknown",
    status: data.status ?? "in_progress",
    summary: {
      title: data.summary?.title ?? "Code review result",
      overview: data.summary?.overview ?? "",
      riskLevel: data.summary?.riskLevel ?? "low",
      recommendation: data.summary?.recommendation ?? "approve_with_comments",
    },
    metrics: {
      score: Number.isFinite(data.metrics?.score) ? data.metrics.score : 0,
      filesReviewed: Number.isFinite(data.metrics?.filesReviewed)
        ? data.metrics.filesReviewed
        : reviewedFiles.length,
      findingsTotal: Number.isFinite(data.metrics?.findingsTotal)
        ? data.metrics.findingsTotal
        : findings.length,
      findingsBySeverity: {
        critical: counts.critical ?? findings.filter((item) => item.severity === "critical").length,
        high: counts.high ?? findings.filter((item) => item.severity === "high").length,
        medium: counts.medium ?? findings.filter((item) => item.severity === "medium").length,
        low: counts.low ?? findings.filter((item) => item.severity === "low").length,
        info: counts.info ?? findings.filter((item) => item.severity === "info").length,
      },
    },
    findings: findings
      .map((finding, index) => ({
        id: finding.id ?? `finding-${index + 1}`,
        severity: finding.severity ?? "info",
        category: finding.category ?? "maintainability",
        title: finding.title ?? "Untitled finding",
        message: finding.message ?? "",
        location: {
          file: finding.location?.file ?? "unknown",
          line: finding.location?.line ?? 1,
          column: finding.location?.column,
          endLine: finding.location?.endLine,
          snippet: finding.location?.snippet ?? "",
        },
        impact: finding.impact ?? "",
        suggestion: {
          description: finding.suggestion?.description ?? "",
          patch: finding.suggestion?.patch ?? "",
        },
        display: {
          priority: finding.display?.priority ?? index + 1,
          isBlocking: Boolean(finding.display?.isBlocking),
          badgeLabel: finding.display?.badgeLabel ?? "",
          collapsedByDefault: Boolean(finding.display?.collapsedByDefault),
        },
      }))
      .sort((a, b) => a.display.priority - b.display.priority),
    reviewedFiles: reviewedFiles.map((file, index) => ({
      file: file.file ?? `file-${index + 1}`,
      status: file.status ?? "skipped",
      findingCount: Number.isFinite(file.findingCount) ? file.findingCount : 0,
    })),
    actions: actions.map((action) => ({
      label: action.label ?? "Review action",
      type: action.type ?? "discuss",
      findingId: action.findingId,
    })),
    reviewedAt: data.reviewedAt ?? new Date().toISOString(),
  };
}

function renderHeader() {
  nodes.title.textContent = review.summary.title;
  nodes.overview.textContent = review.summary.overview;
  nodes.statusBadge.className = badgeClass(review.status);
  nodes.statusBadge.textContent = labels.statuses[review.status] ?? review.status;
  nodes.riskBadge.className = badgeClass(review.summary.riskLevel);
  nodes.riskBadge.textContent = labels.risks[review.summary.riskLevel] ?? review.summary.riskLevel;
  nodes.recommendation.textContent =
    labels.recommendations[review.summary.recommendation] ?? review.summary.recommendation;
}

function renderMetrics() {
  nodes.metricScore.textContent = review.metrics.score;
  nodes.metricFiles.textContent = review.metrics.filesReviewed;
  nodes.metricFindings.textContent = review.metrics.findingsTotal;
  nodes.metricDate.textContent = formatDate(review.reviewedAt);
  nodes.severityTotal.textContent = review.metrics.findingsTotal;
}

function renderSeverityBars() {
  const severities = ["critical", "high", "medium", "low", "info"];
  const max = Math.max(1, ...severities.map((severity) => review.metrics.findingsBySeverity[severity]));

  nodes.severityBars.replaceChildren(
    ...severities.map((severity) => {
      const count = review.metrics.findingsBySeverity[severity] ?? 0;
      const item = document.createElement("div");
      item.className = "severity-bar";

      const label = document.createElement("div");
      label.className = "severity-label";
      const labelText = document.createElement("span");
      labelText.textContent = labels.severities[severity];
      const labelCount = document.createElement("strong");
      labelCount.textContent = count;
      label.append(labelText, labelCount);

      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = `bar-fill bar-${severity}`;
      fill.style.width = `${(count / max) * 100}%`;
      track.append(fill);

      item.append(label, track);
      return item;
    })
  );
}

function renderFiles() {
  nodes.fileCount.textContent = review.reviewedFiles.length;

  if (!review.reviewedFiles.length) {
    nodes.fileList.innerHTML = '<div class="empty-state">No files</div>';
    return;
  }

  nodes.fileList.replaceChildren(
    ...review.reviewedFiles.map((file) => {
      const item = document.createElement("div");
      item.className = "file-item";

      const fileText = document.createElement("div");
      const name = document.createElement("div");
      name.className = "file-name";
      name.textContent = file.file;
      const status = document.createElement("div");
      status.className = "file-status";
      status.textContent = labels.fileStatuses[file.status] ?? file.status;
      fileText.append(name, status);

      const count = document.createElement("span");
      count.className = `badge ${file.findingCount > 0 ? "badge-medium" : "badge-low"}`;
      count.textContent = file.findingCount;

      item.append(fileText, count);
      return item;
    })
  );
}

function renderFilters() {
  const severities = ["all", "critical", "high", "medium", "low", "info"];

  nodes.filterTabs.replaceChildren(
    ...severities.map((severity) => {
      const count =
        severity === "all" ? review.findings.length : review.findings.filter((item) => item.severity === severity).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-tab${severity === activeSeverity ? " active" : ""}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", severity === activeSeverity ? "true" : "false");
      button.textContent = `${labels.severities[severity]} ${count}`;
      button.addEventListener("click", () => {
        activeSeverity = severity;
        const firstVisible = getVisibleFindings()[0];
        selectedFindingId = firstVisible?.id ?? "";
        render();
      });
      return button;
    })
  );
}

function getVisibleFindings() {
  if (activeSeverity === "all") {
    return review.findings;
  }

  return review.findings.filter((finding) => finding.severity === activeSeverity);
}

function renderFindings() {
  const visibleFindings = getVisibleFindings();
  nodes.visibleFindingsCount.textContent = visibleFindings.length;

  if (!visibleFindings.length) {
    nodes.findingsList.innerHTML = '<div class="empty-state">No findings</div>';
    renderDetail(null);
    return;
  }

  if (!visibleFindings.some((finding) => finding.id === selectedFindingId)) {
    selectedFindingId = visibleFindings[0].id;
  }

  nodes.findingsList.replaceChildren(
    ...visibleFindings.map((finding) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `finding-item${finding.id === selectedFindingId ? " active" : ""}`;

      const row = document.createElement("div");
      row.className = "finding-row";
      const severity = document.createElement("span");
      severity.className = badgeClass(finding.severity);
      severity.textContent = labels.severities[finding.severity] ?? finding.severity;
      const category = document.createElement("span");
      category.className = "category-label";
      category.textContent = finding.category;
      row.append(severity, category);

      const title = document.createElement("div");
      title.className = "finding-title";
      title.textContent = finding.title;

      const location = document.createElement("div");
      location.className = "finding-location";
      location.textContent = findingLocation(finding);

      button.append(row, title, location);
      button.addEventListener("click", () => {
        selectedFindingId = finding.id;
        renderFindings();
      });
      return button;
    })
  );

  renderDetail(visibleFindings.find((finding) => finding.id === selectedFindingId));
}

function renderDetail(finding) {
  if (!finding) {
    nodes.detailSeverity.className = "badge";
    nodes.detailSeverity.textContent = "None";
    nodes.detailTitle.textContent = "No finding selected";
    nodes.detailCategory.textContent = "";
    nodes.detailLocation.textContent = "-";
    nodes.detailBlocking.textContent = "-";
    nodes.detailMessage.textContent = "";
    nodes.detailImpact.textContent = "";
    nodes.detailSuggestion.textContent = "";
    nodes.detailPatch.textContent = "";
    nodes.detailSnippet.textContent = "";
    return;
  }

  nodes.detailSeverity.className = badgeClass(finding.severity);
  nodes.detailSeverity.textContent = labels.severities[finding.severity] ?? finding.severity;
  nodes.detailTitle.textContent = finding.title;
  nodes.detailCategory.textContent = finding.category;
  nodes.detailLocation.textContent = findingLocation(finding);
  nodes.detailBlocking.textContent = finding.display.isBlocking ? "Yes" : "No";
  nodes.detailMessage.textContent = finding.message;
  nodes.detailImpact.textContent = finding.impact;
  nodes.detailSuggestion.textContent = finding.suggestion.description;
  nodes.detailPatch.textContent = finding.suggestion.patch ?? "";
  nodes.detailSnippet.textContent = finding.location.snippet ?? "";
}

function renderActions() {
  nodes.actionCount.textContent = review.actions.length;

  if (!review.actions.length) {
    nodes.actionList.innerHTML = '<div class="empty-state">No actions</div>';
    return;
  }

  nodes.actionList.replaceChildren(
    ...review.actions.map((action) => {
      const item = document.createElement("div");
      item.className = "action-item";

      const dot = document.createElement("span");
      dot.className = "action-dot";
      const label = document.createElement("span");
      label.className = "action-label";
      label.textContent = action.label;
      const type = document.createElement("span");
      type.className = "action-type";
      type.textContent = action.type;

      item.append(dot, label, type);
      return item;
    })
  );
}

function render() {
  renderHeader();
  renderMetrics();
  renderSeverityBars();
  renderFiles();
  renderFilters();
  renderFindings();
  renderActions();
}

nodes.jsonInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    review = normalizeReview(JSON.parse(text));
    activeSeverity = "all";
    selectedFindingId = review.findings[0]?.id ?? "";
    render();
  } catch (error) {
    alert("JSON 파일을 읽을 수 없습니다.");
  } finally {
    event.target.value = "";
  }
});

nodes.resetButton.addEventListener("click", () => {
  review = structuredClone(defaultReview);
  activeSeverity = "all";
  selectedFindingId = review.findings[0]?.id ?? "";
  render();
});

review = normalizeReview(review);
selectedFindingId = review.findings[0]?.id ?? "";
render();
