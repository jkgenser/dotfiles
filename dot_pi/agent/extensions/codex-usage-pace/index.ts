/*
 * Weekly Codex usage pacing for Pi.
 *
 * The authentication/query fallback and normalization approach is adapted
 * from @llblab/pi-codex-usage 0.9.1 (MIT), commit 5a3be294. See
 * LICENSES/upstream-MIT.txt. The pacing UI and calculations are local.
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { createInterface } from "node:readline"
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import {
  calculatePace,
  clampPercent,
  formatPaceDelta,
  formatProgressBar,
  formatResetCountdown,
  MINUTE_MS,
  roundedPercent,
  SECOND_MS,
  selectWeeklyWindow,
  type RateLimitSnapshot,
  type RateLimitWindow,
  type UsageReport,
} from "./pace.ts"

const PROVIDER_ID = "openai-codex"
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const STATUS_KEY = "codex-usage-pace"
const QUERY_TIMEOUT_MS = 15_000
const REFRESH_INTERVAL_MS = 3 * MINUTE_MS
const MIN_REFRESH_GAP_MS = 15 * SECOND_MS
const DISPLAY_INTERVAL_MS = MINUTE_MS
const MAX_ERROR_BODY_CHARS = 600
const BAR_WIDTH = 10
const PACE_TOLERANCE_PP = 3

type Timer = ReturnType<typeof setTimeout> & { unref?: () => void }
type PiModel = NonNullable<ExtensionContext["model"]>
type QuerySource = "pi-auth" | "codex-app-server"
type QueryError = { source: QuerySource; message: string; cause?: unknown }
type QueryResult =
  | { ok: true; report: UsageReport }
  | { ok: false; errors: QueryError[] }

type BackendPayload = {
  rate_limit?: unknown
}

type BackendRateLimit = {
  primary_window?: unknown
  secondary_window?: unknown
}

type BackendWindow = {
  used_percent?: unknown
  limit_window_seconds?: unknown
  reset_at?: unknown
  resets_at?: unknown
  reset_after_seconds?: unknown
}

type AppServerResponse = {
  rateLimits?: unknown
  rateLimitsByLimitId?: unknown
}

type AppServerSnapshot = {
  limitId?: unknown
  primary?: unknown
  secondary?: unknown
}

type AppServerWindow = {
  usedPercent?: unknown
  windowDurationMins?: unknown
  resetsAt?: unknown
  resetAt?: unknown
  resetAfterSeconds?: unknown
}

type RpcResponse = {
  id?: unknown
  result?: unknown
  error?: { message?: unknown }
}

type PendingRpc = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const isCodexModel = (
  model: Pick<PiModel, "provider"> | undefined,
): boolean => model?.provider === PROVIDER_ID

const asObject = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  return value as Record<string, unknown>
}

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const asTimestampMs = (value: unknown): number | undefined => {
  const numeric = asNumber(value)
  if (numeric !== undefined) {
    if (numeric <= 0) return
    return numeric < 10_000_000_000 ? numeric * SECOND_MS : numeric
  }
  if (typeof value !== "string" || !value.trim()) return
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const normalizeBackendWindow = (
  value: unknown,
  capturedAt: number,
): RateLimitWindow | undefined => {
  const raw = asObject(value) as BackendWindow | undefined
  if (!raw) return
  const usedPercent = asNumber(raw.used_percent)
  if (usedPercent === undefined) return

  const durationSeconds = asNumber(raw.limit_window_seconds)
  const absoluteReset = asTimestampMs(raw.reset_at ?? raw.resets_at)
  const relativeResetSeconds = asNumber(raw.reset_after_seconds)
  const resetAtMs =
    absoluteReset ??
    (relativeResetSeconds !== undefined && relativeResetSeconds >= 0
      ? capturedAt + relativeResetSeconds * SECOND_MS
      : undefined)

  return {
    usedPercent,
    durationMs:
      durationSeconds !== undefined && durationSeconds > 0
        ? durationSeconds * SECOND_MS
        : undefined,
    resetAtMs,
  }
}

export const normalizeBackendPayload = (
  payload: BackendPayload,
  capturedAt = Date.now(),
): UsageReport => {
  const rateLimit = asObject(payload.rate_limit) as BackendRateLimit | undefined
  if (!rateLimit) throw new Error("Codex usage endpoint returned no rate limit")

  const snapshot: RateLimitSnapshot = {
    limitId: "codex",
    primary: normalizeBackendWindow(rateLimit.primary_window, capturedAt),
    secondary: normalizeBackendWindow(rateLimit.secondary_window, capturedAt),
  }
  if (!snapshot.primary && !snapshot.secondary) {
    throw new Error("Codex usage endpoint returned no displayable windows")
  }
  return { snapshots: [snapshot] }
}

const normalizeAppServerWindow = (
  value: unknown,
  capturedAt: number,
): RateLimitWindow | undefined => {
  const raw = asObject(value) as AppServerWindow | undefined
  if (!raw) return
  const usedPercent = asNumber(raw.usedPercent)
  if (usedPercent === undefined) return

  const durationMinutes = asNumber(raw.windowDurationMins)
  const absoluteReset = asTimestampMs(raw.resetsAt ?? raw.resetAt)
  const relativeResetSeconds = asNumber(raw.resetAfterSeconds)

  return {
    usedPercent,
    durationMs:
      durationMinutes !== undefined && durationMinutes > 0
        ? durationMinutes * MINUTE_MS
        : undefined,
    resetAtMs:
      absoluteReset ??
      (relativeResetSeconds !== undefined && relativeResetSeconds >= 0
        ? capturedAt + relativeResetSeconds * SECOND_MS
        : undefined),
  }
}

const normalizeAppServerSnapshot = (
  value: unknown,
  fallbackId: string,
  capturedAt: number,
): RateLimitSnapshot | undefined => {
  const raw = asObject(value) as AppServerSnapshot | undefined
  if (!raw) return
  const snapshot: RateLimitSnapshot = {
    limitId: asString(raw.limitId) ?? fallbackId,
    primary: normalizeAppServerWindow(raw.primary, capturedAt),
    secondary: normalizeAppServerWindow(raw.secondary, capturedAt),
  }
  return snapshot.primary || snapshot.secondary ? snapshot : undefined
}

const mergeSnapshot = (
  left: RateLimitSnapshot,
  right: RateLimitSnapshot,
): RateLimitSnapshot => ({
  limitId: right.limitId || left.limitId,
  primary: right.primary ?? left.primary,
  secondary: right.secondary ?? left.secondary,
})

export const normalizeAppServerResponse = (
  response: AppServerResponse,
  capturedAt = Date.now(),
): UsageReport => {
  const snapshots: RateLimitSnapshot[] = []
  const add = (value: unknown, fallbackId: string) => {
    const snapshot = normalizeAppServerSnapshot(value, fallbackId, capturedAt)
    if (!snapshot) return
    const index = snapshots.findIndex(
      (candidate) => candidate.limitId.toLowerCase() === snapshot.limitId.toLowerCase(),
    )
    if (index >= 0) snapshots[index] = mergeSnapshot(snapshots[index], snapshot)
    else snapshots.push(snapshot)
  }

  if (Array.isArray(response.rateLimits)) {
    for (const value of response.rateLimits) add(value, "codex")
  } else {
    add(response.rateLimits, "codex")
  }

  const byLimitId = asObject(response.rateLimitsByLimitId)
  if (byLimitId) {
    for (const [limitId, value] of Object.entries(byLimitId)) add(value, limitId)
  }

  if (snapshots.length === 0) {
    throw new Error("codex app-server returned no displayable windows")
  }
  return { snapshots }
}

const hasHeader = (headers: Record<string, string>, name: string): boolean =>
  Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase())

const codexAuthCandidateModels = (ctx: ExtensionContext): PiModel[] => {
  const candidates: PiModel[] = []
  const seen = new Set<string>()
  const add = (model: PiModel | undefined) => {
    if (!model || model.provider !== PROVIDER_ID) return
    const key = `${model.provider}/${model.id}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(model)
  }

  add(ctx.model)
  for (const model of ctx.modelRegistry.getAvailable()) add(model)
  for (const model of ctx.modelRegistry.getAll()) add(model)
  return candidates
}

const resolvePiAuth = async (
  ctx: ExtensionContext,
): Promise<Record<string, string> | undefined> => {
  const errors: string[] = []
  for (const model of codexAuthCandidateModels(ctx)) {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model)
    if (!auth.ok) {
      errors.push(auth.error)
      continue
    }
    const headers = { ...(auth.headers ?? {}) }
    if (!hasHeader(headers, "Authorization") && auth.apiKey) {
      headers.Authorization = `Bearer ${auth.apiKey}`
    }
    if (!hasHeader(headers, "User-Agent")) {
      headers["User-Agent"] = "pi-codex-usage-pace"
    }
    if (hasHeader(headers, "Authorization")) return headers
  }

  if (errors.length > 0) throw new Error(errors.join("; "))
  return
}

const redactErrorBody = (body: string): string => {
  const redacted = body
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"<redacted>"')
    .trim()
  return redacted.length <= MAX_ERROR_BODY_CHARS
    ? redacted
    : `${redacted.slice(0, MAX_ERROR_BODY_CHARS - 1)}…`
}

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Timed out fetching Codex usage after ${timeoutMs / 1000}s`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const queryViaPiAuth = async (
  ctx: ExtensionContext,
  timeoutMs: number,
): Promise<UsageReport> => {
  const headers = await resolvePiAuth(ctx)
  if (!headers) {
    throw new Error("No Pi OpenAI Codex subscription auth was available")
  }

  const response = await fetchWithTimeout(USAGE_URL, { headers }, timeoutMs)
  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `Codex usage endpoint returned ${response.status} ${response.statusText}: ${redactErrorBody(body)}`,
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch (error) {
    throw new Error(
      `Codex usage endpoint returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const object = asObject(payload)
  if (!object) throw new Error("Codex usage endpoint response was not an object")
  return normalizeBackendPayload(object as BackendPayload)
}

class CodexAppServerClient {
  private child?: ChildProcessWithoutNullStreams
  private nextId = 1
  private stderr = ""
  private readonly pending = new Map<number, PendingRpc>()
  private readonly timeoutMs: number

  constructor(timeoutMs: number) {
    this.timeoutMs = timeoutMs
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        stdio: ["pipe", "pipe", "pipe"],
      })
      this.child = child
      const timeout = setTimeout(() => {
        reject(new Error("Timed out starting codex app-server"))
      }, this.timeoutMs)

      child.once("spawn", () => {
        clearTimeout(timeout)
        resolve()
      })
      child.once("error", (error) => {
        clearTimeout(timeout)
        reject(new Error(`Failed to start codex app-server: ${error.message}`))
        this.rejectAll(error)
      })
      child.once("exit", (code, signal) => {
        const suffix = this.stderr ? `: ${redactErrorBody(this.stderr)}` : ""
        this.rejectAll(
          new Error(
            `codex app-server exited (code ${code ?? "unknown"}, signal ${signal ?? "none"})${suffix}`,
          ),
        )
      })
      child.stderr.setEncoding("utf8")
      child.stderr.on("data", (chunk: string) => {
        this.stderr = `${this.stderr}${chunk}`.slice(-MAX_ERROR_BODY_CHARS)
      })
      createInterface({ input: child.stdout }).on("line", (line) =>
        this.handleLine(line),
      )
    })
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const child = this.child
    if (!child?.stdin.writable) throw new Error("codex app-server is not running")

    const id = this.nextId++
    const response = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timed out waiting for codex app-server ${method}`))
      }, this.timeoutMs)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
    })

    const payload = params === undefined ? { method, id } : { method, id, params }
    child.stdin.write(`${JSON.stringify(payload)}\n`)
    return response
  }

  notify(method: string): void {
    if (this.child?.stdin.writable) {
      this.child.stdin.write(`${JSON.stringify({ method })}\n`)
    }
  }

  dispose(): void {
    this.rejectAll(new Error("codex app-server request cancelled"))
    const child = this.child
    if (!child) return
    child.stdin.end()
    if (!child.killed) child.kill()
    this.child = undefined
  }

  private handleLine(line: string): void {
    let response: RpcResponse
    try {
      response = JSON.parse(line) as RpcResponse
    } catch {
      return
    }
    if (typeof response.id !== "number") return
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)

    if (response.error) {
      pending.reject(
        new Error(
          `codex app-server request failed: ${asString(response.error.message) ?? "unknown error"}`,
        ),
      )
      return
    }
    pending.resolve(response.result)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

const queryViaAppServer = async (timeoutMs: number): Promise<UsageReport> => {
  const client = new CodexAppServerClient(timeoutMs)
  try {
    await client.start()
    await client.request("initialize", {
      clientInfo: {
        name: "pi_codex_usage_pace",
        title: "Pi Codex Usage Pace",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    })
    client.notify("initialized")
    const result = asObject(await client.request("account/rateLimits/read"))
    if (!result) throw new Error("account/rateLimits/read returned no object")
    return normalizeAppServerResponse(result as AppServerResponse)
  } finally {
    client.dispose()
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const queryUsage = async (ctx: ExtensionContext): Promise<QueryResult> => {
  const errors: QueryError[] = []
  for (const source of ["pi-auth", "codex-app-server"] as const) {
    try {
      const report =
        source === "pi-auth"
          ? await queryViaPiAuth(ctx, QUERY_TIMEOUT_MS)
          : await queryViaAppServer(QUERY_TIMEOUT_MS)
      if (selectWeeklyWindow(report)) return { ok: true, report }
      errors.push({ source, message: `${source} returned no weekly Codex window` })
    } catch (cause) {
      errors.push({ source, message: errorMessage(cause), cause })
    }
  }
  return { ok: false, errors }
}

const isUnavailableError = (error: QueryError): boolean => {
  const message = error.message.toLowerCase()
  return (
    message.includes("no pi openai codex subscription auth") ||
    message.includes("no weekly codex window") ||
    message.includes("returned 401") ||
    message.includes("returned 403") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("subscription") ||
    message.includes("no active plan") ||
    message.includes("quota unavailable")
  )
}

export const isStaleContextError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("ctx is stale")

const logTimerError = (error: unknown): void => {
  if (isStaleContextError(error)) return
  console.error(`[codex-usage-pace] ${errorMessage(error)}`)
}

const usageColor = (
  usedPercent: number,
  deltaPercentagePoints: number,
): "muted" | "success" | "warning" | "error" => {
  if (usedPercent >= 100 || deltaPercentagePoints >= 15) return "error"
  if (deltaPercentagePoints > PACE_TOLERANCE_PP) return "warning"
  if (deltaPercentagePoints < -PACE_TOLERANCE_PP) return "success"
  return "muted"
}

export const formatStatusline = (
  report: UsageReport,
  ctx: Pick<ExtensionContext, "ui">,
  now = Date.now(),
): string => {
  const label = ctx.ui.theme.fg("accent", "codex")
  const weekly = selectWeeklyWindow(report)
  if (!weekly) return `${label} ${ctx.ui.theme.fg("muted", "n/a")}`

  const pace = calculatePace(weekly, now)
  const used = roundedPercent(clampPercent(weekly.usedPercent))
  if (!pace) {
    const usage = ctx.ui.theme.fg(
      "muted",
      `u ${formatProgressBar(used, BAR_WIDTH)} ${used}%`,
    )
    const reset = weekly.resetAtMs
      ? ` ${ctx.ui.theme.fg("dim", formatResetCountdown(weekly.resetAtMs, now))}`
      : ""
    return `${label} ${usage}${reset}`
  }

  const elapsed = roundedPercent(pace.elapsedPercent)
  const delta = formatPaceDelta(
    pace.deltaPercentagePoints,
    PACE_TOLERANCE_PP,
  )
  const color = usageColor(pace.usedPercent, pace.deltaPercentagePoints)
  const timeText = ctx.ui.theme.fg(
    "dim",
    `t ${formatProgressBar(pace.elapsedPercent, BAR_WIDTH)} ${elapsed}%`,
  )
  const usageText = ctx.ui.theme.fg(
    color,
    `u ${formatProgressBar(pace.usedPercent, BAR_WIDTH)} ${used}%`,
  )
  const deltaText = ctx.ui.theme.fg(color, delta)
  const countdown = ctx.ui.theme.fg(
    "dim",
    formatResetCountdown(pace.resetAtMs, now),
  )
  return `${label} ${timeText} ${usageText} ${deltaText} ${countdown}`
}

export default function codexUsagePace(pi: ExtensionAPI) {
  let report: UsageReport | undefined
  let lastFetchedAt = 0
  let active = true
  let inFlight: Promise<void> | undefined
  let refreshTimer: Timer | undefined
  let displayTimer: Timer | undefined

  const clearTimers = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    if (displayTimer) clearTimeout(displayTimer)
    refreshTimer = undefined
    displayTimer = undefined
  }

  const clearStatus = (ctx: ExtensionContext) => {
    clearTimers()
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined)
  }

  const render = (ctx: ExtensionContext) => {
    if (!ctx.hasUI || !isCodexModel(ctx.model)) return
    if (report) {
      ctx.ui.setStatus(STATUS_KEY, formatStatusline(report, ctx))
    } else {
      ctx.ui.setStatus(
        STATUS_KEY,
        `${ctx.ui.theme.fg("accent", "codex")} ${ctx.ui.theme.fg("dim", "…")}`,
      )
    }
  }

  const scheduleDisplay = (ctx: ExtensionContext) => {
    if (displayTimer) clearTimeout(displayTimer)
    displayTimer = setTimeout(() => {
      displayTimer = undefined
      try {
        if (!active || !isCodexModel(ctx.model)) return
        render(ctx)
        const weekly = report && selectWeeklyWindow(report)
        if (weekly?.resetAtMs !== undefined && weekly.resetAtMs <= Date.now()) {
          void refresh(ctx, true).catch(logTimerError)
          return
        }
        scheduleDisplay(ctx)
      } catch (error) {
        if (isStaleContextError(error)) clearTimers()
        else logTimerError(error)
      }
    }, DISPLAY_INTERVAL_MS) as Timer
    displayTimer.unref?.()
  }

  const scheduleRefresh = (ctx: ExtensionContext) => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      void refresh(ctx, true).catch(logTimerError)
    }, REFRESH_INTERVAL_MS) as Timer
    refreshTimer.unref?.()
  }

  const refresh = async (
    ctx: ExtensionContext,
    force: boolean,
  ): Promise<void> => {
    if (!active || !ctx.hasUI) return
    if (!isCodexModel(ctx.model)) {
      clearStatus(ctx)
      return
    }

    render(ctx)
    scheduleDisplay(ctx)
    if (!force && Date.now() - lastFetchedAt < MIN_REFRESH_GAP_MS) {
      scheduleRefresh(ctx)
      return
    }
    if (inFlight) return inFlight

    const task = (async () => {
      const result = await queryUsage(ctx)
      if (!active || !isCodexModel(ctx.model)) return

      if (result.ok) {
        report = result.report
        lastFetchedAt = Date.now()
        render(ctx)
      } else if (!report) {
        const unavailable =
          result.errors.length > 0 && result.errors.every(isUnavailableError)
        const value = unavailable ? "n/a" : "error"
        ctx.ui.setStatus(
          STATUS_KEY,
          `${ctx.ui.theme.fg("accent", "codex")} ${ctx.ui.theme.fg(unavailable ? "muted" : "error", value)}`,
        )
      }
      scheduleRefresh(ctx)
      scheduleDisplay(ctx)
    })().finally(() => {
      if (inFlight === task) inFlight = undefined
    })

    inFlight = task
    return task
  }

  pi.on("session_start", (_event, ctx) => {
    active = true
    void refresh(ctx, false).catch(logTimerError)
  })

  pi.on("session_tree", (_event, ctx) => {
    void refresh(ctx, false).catch(logTimerError)
  })

  pi.on("model_select", (event, ctx) => {
    clearTimers()
    if (isCodexModel(event.model)) {
      void refresh(ctx, false).catch(logTimerError)
    } else if (ctx.hasUI) {
      ctx.ui.setStatus(STATUS_KEY, undefined)
    }
  })

  pi.on("agent_settled", (_event, ctx) => {
    if (isCodexModel(ctx.model)) {
      void refresh(ctx, false).catch(logTimerError)
    }
  })

  pi.on("session_shutdown", (_event, ctx) => {
    active = false
    clearStatus(ctx)
  })
}
