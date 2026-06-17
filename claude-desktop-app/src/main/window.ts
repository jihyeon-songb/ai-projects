import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

/** 캐릭터 윈도우 크기 (카드 + 캐릭터를 세로로 담을 공간 포함) */
const WIN_WIDTH = 380
// 투명 윈도우라 키워도 빈 공간은 안 보임. 긴 명령어 카드가 위로 안 잘리게 여유를 둠.
// 윈도우 하단(y+height)은 고정이라 캐릭터 위치는 그대로.
// ponytail: 고정 높이. 동시 세션 3개+면 위쪽 말풍선이 잘릴 수 있음 → 세션 수 기반 동적 높이로 올릴 것.
const WIN_HEIGHT = 580

export function createCharacterWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    // 처음엔 화면 우하단 근처에 띄움
    x: workArea.x + workArea.width - WIN_WIDTH - 40,
    y: workArea.y + workArea.height - WIN_HEIGHT - 40,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 모든 워크스페이스/전체화면 위에 떠 있도록
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 기본은 마우스 통과(forward: true 로 mousemove 는 계속 받아 호버 감지)
  win.setIgnoreMouseEvents(true, { forward: true })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
