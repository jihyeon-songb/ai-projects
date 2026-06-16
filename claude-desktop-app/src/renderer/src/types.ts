export interface PermissionRequest {
  id: string
  toolName: string
  summary: string
  detail: string
  cwd?: string
  sessionId?: string
}

export interface NotifyPayload {
  type?: string
  'last-assistant-message'?: string
  'input-messages'?: string[]
  cwd?: string
  session_id?: string
}
