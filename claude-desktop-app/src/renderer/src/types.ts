export interface QuestionSpec {
  question: string
  header: string
  multiSelect?: boolean
  options: { label: string; description?: string }[]
}

export interface PermissionRequest {
  id: string
  toolName: string
  summary: string
  detail: string
  cwd?: string
  sessionId?: string
  kind?: 'tool' | 'question'
  questions?: QuestionSpec[]
}

export interface NotifyPayload {
  type?: string
  'last-assistant-message'?: string
  'input-messages'?: string[]
  cwd?: string
  session_id?: string
}
