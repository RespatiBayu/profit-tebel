type AnalyticsParamValue = string | number | boolean | null | undefined

export type AnalyticsParams = Record<string, AnalyticsParamValue>

function normalizeParamValue(value: AnalyticsParamValue) {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return undefined
  }

  return value
}

function sanitizeParams(params: AnalyticsParams) {
  return Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      const normalized = normalizeParamValue(value)
      return normalized === undefined ? [] : [[key, normalized]]
    })
  )
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (typeof window === 'undefined') {
    return
  }

  const payload = sanitizeParams(params)

  if (typeof window.gtag === 'function') {
    window.gtag('event', name, payload)
  }

  if (typeof window.clarity === 'function') {
    window.clarity('event', name)
  }
}

export function setAnalyticsTag(
  key: string,
  value: string | number | boolean | Array<string | number | boolean> | null | undefined
) {
  if (typeof window === 'undefined' || typeof window.clarity !== 'function' || value === null || value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    window.clarity('set', key, value.map((item) => String(item)))
    return
  }

  window.clarity('set', key, String(value))
}

export function setAnalyticsTags(
  tags: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>
) {
  for (const [key, value] of Object.entries(tags)) {
    setAnalyticsTag(key, value)
  }
}
