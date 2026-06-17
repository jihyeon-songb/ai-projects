import type { ClaudieApi } from './index'

declare global {
  interface Window {
    claudie: ClaudieApi
  }
}

export {}
