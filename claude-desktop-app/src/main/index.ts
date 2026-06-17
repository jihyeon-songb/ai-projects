import { app, BrowserWindow, ipcMain, Menu, Notification, screen } from 'electron'
import { spawn } from 'node:child_process'
import { Bridge, type Decision } from './bridge'
import { createCharacterWindow } from './window'

// TERM_PROGRAM → macOS 앱 이름. ponytail: 흔한 것만, 빠지면 .app 떼고 그대로 시도.
const TERM_APPS: Record<string, string> = {
  Apple_Terminal: 'Terminal',
  'iTerm.app': 'iTerm',
  vscode: 'Visual Studio Code',
  Hyper: 'Hyper',
  WezTerm: 'WezTerm',
  ghostty: 'Ghostty',
  Tabby: 'Tabby',
  WarpTerminal: 'Warp'
}

/** 알림 클릭 시 클로디가 떠 있는 터미널 창으로 포커스. 실패해도 무시(알림이 이미 알려줌). */
function focusTerminal(term?: string): void {
  if (!term || process.platform !== 'darwin') return
  const appName = TERM_APPS[term] ?? term.replace(/\.app$/, '')
  spawn('open', ['-a', appName]).on('error', () => {})
}

let win: BrowserWindow | null = null
const bridge = new Bridge()

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

/** 패키징된 앱일 때만 로그인 시 자동 실행 등록 (dev 실행은 제외) */
function setupAutoLaunch(): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false // 독은 어차피 숨기므로 백그라운드 컴패니언으로 뜸
  })
}

async function bootstrap(): Promise<void> {
  setupAutoLaunch()
  win = createCharacterWindow()

  // ── 브릿지 → 렌더러 ──────────────────────────────────────────
  bridge.on('notify', (payload) => {
    if (payload?.type && payload.type !== 'agent-turn-complete') return
    send('claude:turn-complete', payload)

    // OS 네이티브 알림(선택)
    if (Notification.isSupported()) {
      const msg = payload?.['last-assistant-message'] || '작업이 완료됐어요!'
      new Notification({ title: '클로디 · 작업 완료', body: String(msg).slice(0, 160) }).show()
    }
  })

  bridge.on('permission', (request) => {
    send('claude:permission-request', request)
  })

  // ExitPlanMode: 카드로 안 막고 OS 알림만. 클릭하면 터미널로 가서 직접 선택.
  bridge.on('plan-ready', (request) => {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: '클로디 · 계획 준비됨',
      body: '터미널에서 진행 방식을 선택하세요'
    })
    n.on('click', () => focusTerminal(request.termProgram))
    n.show()
  })

  bridge.on('permission-timeout', (id: string) => {
    send('claude:permission-resolved', id)
  })

  // ── 렌더러 → 브릿지/윈도우 ───────────────────────────────────
  ipcMain.on(
    'claude:permission-decision',
    (_e, id: string, decision: Decision | 'answer', payload?: string) => {
      bridge.resolvePermission(id, decision, payload)
      send('claude:permission-resolved', id)
    }
  )

  // 인터랙티브 영역 호버 시 마우스 통과 토글
  ipcMain.on('claudie:set-interactive', (_e, interactive: boolean) => {
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(!interactive, { forward: true })
    }
  })

  // ── 캐릭터 드래그: 커서를 따라 윈도우를 이동 ───────────────────
  // -webkit-app-region: drag 는 transform 애니메이션 위에서 동작이 불안정해서
  // 메인 프로세스에서 직접 커서 위치를 추적해 윈도우를 옮긴다.
  let dragTimer: NodeJS.Timeout | null = null
  let dragOffset = { x: 0, y: 0 }

  const stopDrag = (): void => {
    if (dragTimer) clearInterval(dragTimer)
    dragTimer = null
  }

  ipcMain.on('claudie:drag-start', () => {
    if (!win || win.isDestroyed()) return
    stopDrag()
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
    dragTimer = setInterval(() => {
      if (!win || win.isDestroyed()) return stopDrag()
      const p = screen.getCursorScreenPoint()
      win.setPosition(p.x - dragOffset.x, p.y - dragOffset.y)
    }, 16)
  })

  ipcMain.on('claudie:drag-end', stopDrag)

  // 캐릭터 우클릭 → 끄기 메뉴. 메뉴가 뜨면 렌더러가 멈춰 mouseup 이 안 와서
  // 드래그가 박힐 수 있으니 먼저 드래그를 끊는다.
  ipcMain.on('claudie:context-menu', () => {
    stopDrag()
    Menu.buildFromTemplate([{ label: '클로디 끄기', click: () => app.quit() }]).popup({
      window: win ?? undefined
    })
  })

  const port = await bridge.start()
  // eslint-disable-next-line no-console
  console.log(`[claudie] bridge listening on 127.0.0.1:${port}`)
}

app.whenReady().then(bootstrap)

app.on('window-all-closed', () => {
  bridge.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})

app.on('before-quit', () => bridge.stop())

// 독에 안 띄우고 백그라운드 컴패니언으로 동작 (macOS)
if (process.platform === 'darwin') app.dock?.hide()
