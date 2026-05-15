export {}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    clarity?: {
      (...args: unknown[]): void
      q?: unknown[]
    }
  }
}
