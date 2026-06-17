import type { OrangiApi } from './index'

declare global {
  interface Window {
    orangi: OrangiApi
  }
}

export {}
