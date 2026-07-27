export const SECOND_MS = 1000
export const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS
export const WEEK_MS = 7 * DAY_MS

export type RateLimitWindow = {
  usedPercent: number
  durationMs?: number
  resetAtMs?: number
}

export type RateLimitSnapshot = {
  limitId: string
  primary?: RateLimitWindow
  secondary?: RateLimitWindow
}

export type UsageReport = {
  snapshots: RateLimitSnapshot[]
}

export type PaceSnapshot = {
  elapsedPercent: number
  usedPercent: number
  deltaPercentagePoints: number
  resetAtMs: number
}

const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"] as const

export const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const isWeeklyDuration = (durationMs: number | undefined): boolean => {
  if (durationMs === undefined) return false
  return durationMs >= 6 * DAY_MS && durationMs <= 8 * DAY_MS
}

/** Selects the seven-day Codex bucket without assuming primary/secondary position. */
export const selectWeeklyWindow = (
  report: UsageReport,
): RateLimitWindow | undefined => {
  const snapshot = report.snapshots.find(
    (candidate) => candidate.limitId.toLowerCase() === "codex",
  )
  if (!snapshot) return

  const windows = [snapshot.primary, snapshot.secondary].filter(
    (window): window is RateLimitWindow => window !== undefined,
  )
  if (windows.length === 0) return

  const explicitWeekly = windows
    .filter((window) => isWeeklyDuration(window.durationMs))
    .sort(
      (left, right) =>
        Math.abs((left.durationMs ?? WEEK_MS) - WEEK_MS) -
        Math.abs((right.durationMs ?? WEEK_MS) - WEEK_MS),
    )[0]
  if (explicitWeekly) return explicitWeekly

  // A single duration-less window is the shape currently returned for some
  // weekly-only accounts. Do not mislabel a known short or monthly window.
  if (windows.length === 1) {
    const only = windows[0]
    return only.durationMs === undefined ? only : undefined
  }

  // Without durations, legacy dual-window responses put weekly in secondary.
  // Known non-weekly durations are not guessed into a weekly label.
  if (windows.every((window) => window.durationMs === undefined)) {
    return snapshot.secondary
  }
  return
}

export const calculatePace = (
  window: RateLimitWindow,
  now = Date.now(),
): PaceSnapshot | undefined => {
  const { durationMs, resetAtMs } = window
  if (
    durationMs === undefined ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    resetAtMs === undefined ||
    !Number.isFinite(resetAtMs)
  ) {
    return
  }

  const periodStartMs = resetAtMs - durationMs
  const elapsedPercent = clampPercent(
    ((now - periodStartMs) / durationMs) * 100,
  )
  const usedPercent = clampPercent(window.usedPercent)

  return {
    elapsedPercent,
    usedPercent,
    deltaPercentagePoints: usedPercent - elapsedPercent,
    resetAtMs,
  }
}

/** Fixed-width progress bar with eighth-cell precision. */
export const formatProgressBar = (percent: number, width = 10): string => {
  const safeWidth = Math.max(1, Math.floor(width))
  const totalParts = safeWidth * 8
  const filledParts = Math.round((clampPercent(percent) / 100) * totalParts)
  const fullCells = Math.floor(filledParts / 8)
  const partialParts = filledParts % 8
  const partial = partialParts > 0 ? PARTIAL_BLOCKS[partialParts] : ""
  const occupiedCells = fullCells + (partial ? 1 : 0)
  return `${"█".repeat(fullCells)}${partial}${"░".repeat(safeWidth - occupiedCells)}`
}

export const roundedPercent = (value: number): number =>
  Math.round(clampPercent(value))

export const formatPaceDelta = (
  deltaPercentagePoints: number,
  tolerance = 3,
): string => {
  if (!Number.isFinite(deltaPercentagePoints)) return ""
  if (Math.abs(deltaPercentagePoints) <= tolerance) return "pace"
  const rounded = Math.round(deltaPercentagePoints)
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}pp`
}

const formatTenths = (value: number): string =>
  value % 10 === 0 ? String(value / 10) : (value / 10).toFixed(1)

export const formatResetCountdown = (
  resetAtMs: number,
  now = Date.now(),
): string => {
  const remainingMs = Math.max(0, resetAtMs - now)
  if (remainingMs > DAY_MS) {
    const dayTenths = Math.max(10, Math.ceil(remainingMs / (DAY_MS / 10)))
    return `${formatTenths(dayTenths)}d`
  }
  if (remainingMs >= HOUR_MS) {
    const hourTenths = Math.max(10, Math.ceil(remainingMs / (HOUR_MS / 10)))
    return `${formatTenths(hourTenths)}h`
  }
  if (remainingMs >= MINUTE_MS) return `${Math.floor(remainingMs / MINUTE_MS)}m`
  return `${Math.floor(remainingMs / SECOND_MS)}s`
}
