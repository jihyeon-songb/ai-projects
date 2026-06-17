import { app, BrowserWindow, ipcMain, Menu, Notification, screen } from 'electron'
import { Bridge, type Decision } from './bridge'
import { createCharacterWindow } from './window'

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
    send('codex:turn-complete', payload)

    // OS 네이티브 알림(선택)
    if (Notification.isSupported()) {
      const msg = payload?.['last-assistant-message'] || '작업이 완료됐어요!'
      new Notification({ title: '코드몽 · 작업 완료', body: String(msg).slice(0, 160) }).show()
    }
  })

  bridge.on('permission', (request) => {
    send('codex:permission-request', request)
  })

  bridge.on('permission-timeout', (id: string) => {
    send('codex:permission-resolved', id)
  })

  // ── 렌더러 → 브릿지/윈도우 ───────────────────────────────────
  ipcMain.on('codex:permission-decision', (_e, id: string, decision: Decision) => {
    bridge.resolvePermission(id, decision)
    send('codex:permission-resolved', id)
  })

  // 캐릭터 우클릭 → 끄기 메뉴
  // 인터랙티브 영역 호버 시 마우스 통과 토글
  ipcMain.on('orangi:set-interactive', (_e, interactive: boolean) => {
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

  ipcMain.on('orangi:drag-start', () => {
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

  ipcMain.on('orangi:drag-end', stopDrag)

  // 캐릭터 우클릭 → 끄기 메뉴. 메뉴가 뜨면 렌더러가 멈춰 mouseup 이 안 와서
  // 드래그가 박힐 수 있으니 먼저 드래그를 끊는다.
  ipcMain.on('orangi:context-menu', () => {
    stopDrag()
    Menu.buildFromTemplate([{ label: '코드몽 끄기', click: () => app.quit() }]).popup({
      window: win ?? undefined
    })
  })

  const port = await bridge.start()
  // eslint-disable-next-line no-console
  console.log(`[orangi] bridge listening on 127.0.0.1:${port}`)
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
