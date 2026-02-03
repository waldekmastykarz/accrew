import type { AccrewAPI } from './main/preload'

declare global {
  interface Window {
    accrew: AccrewAPI
  }
}

export {}
