import { contextBridge, ipcRenderer } from 'electron'

export interface PermissionRequest {
  id: string
  toolName: string
  summary: string
  detail: string
  cwd?: string
}

export interface NotifyPayload {
  type?: string
  'last-assistant-message'?: string
  'input-messages'?: string[]
  cwd?: string
}

const api = {
  /** Codex turn 완료 알림 구독 */
  onTurnComplete(cb: (p: NotifyPayload) => void): () => void {
    const l = (_e: unknown, p: NotifyPayload): void => cb(p)
    ipcRenderer.on('codex:turn-complete', l)
    return () => ipcRenderer.removeListener('codex:turn-complete', l)
  },
  /** 권한 요청 구독 */
  onPermissionRequest(cb: (r: PermissionRequest) => void): () => void {
    const l = (_e: unknown, r: PermissionRequest): void => cb(r)
    ipcRenderer.on('codex:permission-request', l)
    return () => ipcRenderer.removeListener('codex:permission-request', l)
  },
  /** 어떤 요청이 (타임아웃 등으로) 외부에서 해소됐을 때 */
  onPermissionResolved(cb: (id: string) => void): () => void {
    const l = (_e: unknown, id: string): void => cb(id)
    ipcRenderer.on('codex:permission-resolved', l)
    return () => ipcRenderer.removeListener('codex:permission-resolved', l)
  },
  /** 사용자의 허용/취소 결정 전송 */
  decide(id: string, decision: 'allow' | 'deny'): void {
    ipcRenderer.send('codex:permission-decision', id, decision)
  },
  /** 인터랙티브 영역 호버 상태 전달 → 마우스 통과 토글 */
  setInteractive(interactive: boolean): void {
    ipcRenderer.send('orangi:set-interactive', interactive)
  },
  /** 캐릭터를 잡고 드래그 시작 (메인이 커서를 따라 윈도우를 이동) */
  dragStart(): void {
    ipcRenderer.send('orangi:drag-start')
  },
  /** 드래그 종료 */
  dragEnd(): void {
    ipcRenderer.send('orangi:drag-end')
  },
  /** 우클릭 컨텍스트 메뉴(끄기 등) 표시 */
  showMenu(): void {
    ipcRenderer.send('orangi:context-menu')
  }
}

contextBridge.exposeInMainWorld('orangi', api)

export type OrangiApi = typeof api
