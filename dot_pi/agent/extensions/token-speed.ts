/**
 * Live token-throughput display for Pi.
 *
 * Inspired by pi-token-speed by Gabriel Sanhueza:
 * https://github.com/gsanhueza/pi-token-speed
 *
 * Independently implemented against Pi's extension event API after reviewing
 * pi-token-speed v0.7.0 (commit 75e0aca). No upstream source code is vendored.
 */

import { promises as fs } from "node:fs"
import { join } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"

type TokenSpeedConfig = {
  windowMs: number
  showTtft: boolean
  showFinalAverage: boolean
}

type TokenEvent = {
  at: number
  tokens: number
}

type Measurement = {
  tps: number
  tokens: number
  elapsedMs: number
  ttftMs?: number
}

const STATUS_KEY = "token-speed"
const SETTINGS_PATH = join(getAgentDir(), "settings.json")
const DEFAULT_CONFIG: TokenSpeedConfig = {
  windowMs: 1000,
  showTtft: true,
  showFinalAverage: true,
}
const MIN_WINDOW_MS = 100
const MAX_WINDOW_MS = 30_000
const MIN_RATE_SPAN_MS = 100
const UI_UPDATE_INTERVAL_MS = 125

const now = (): number => performance.now()

const clampWindow = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CONFIG.windowMs
  return Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, Math.round(value)))
}

const readConfig = async (): Promise<TokenSpeedConfig> => {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8")
    const settings = JSON.parse(raw) as { tokenSpeed?: Partial<TokenSpeedConfig> }
    const configured = settings.tokenSpeed ?? {}

    return {
      windowMs: clampWindow(configured.windowMs),
      showTtft:
        typeof configured.showTtft === "boolean"
          ? configured.showTtft
          : DEFAULT_CONFIG.showTtft,
      showFinalAverage:
        typeof configured.showFinalAverage === "boolean"
          ? configured.showFinalAverage
          : DEFAULT_CONFIG.showFinalAverage,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Tracks one provider response at a time. Live token counts use Pi's chars/4
 * estimation convention; completed responses are reconciled with provider usage.
 */
export class TokenSpeedTracker {
  private turnStartedAt = 0
  private generationStartedAt = 0
  private estimatedTokens = 0
  private events: TokenEvent[] = []
  private lastRolling: Measurement | undefined

  constructor(private windowMs = DEFAULT_CONFIG.windowMs) {}

  configure(windowMs: number): void {
    this.windowMs = clampWindow(windowMs)
  }

  beginTurn(at = now()): void {
    this.turnStartedAt = at
    this.generationStartedAt = 0
    this.estimatedTokens = 0
    this.events = []
    this.lastRolling = undefined
  }

  beginGeneration(at = now()): void {
    if (this.turnStartedAt === 0) this.turnStartedAt = at
    if (this.generationStartedAt === 0) this.generationStartedAt = at
  }

  recordDelta(delta: string, at = now()): Measurement | undefined {
    if (!delta) return this.lastRolling
    this.beginGeneration(at)

    // This matches the chars/4 heuristic Pi uses when exact usage is unavailable.
    // Fractional increments avoid chunk-boundary spikes from rounding every delta.
    const tokens = delta.length / 4
    if (tokens <= 0) return this.lastRolling

    this.estimatedTokens += tokens
    this.events.push({ at, tokens })
    this.prune(at)

    const windowTokens = this.events.reduce((total, event) => total + event.tokens, 0)
    const firstEventAt = this.events[0]?.at ?? at
    const elapsedMs = Math.max(MIN_RATE_SPAN_MS, at - firstEventAt)
    const tps = (windowTokens * 1000) / elapsedMs

    this.lastRolling = {
      tps,
      tokens: this.estimatedTokens,
      elapsedMs: Math.max(0, at - this.generationStartedAt),
      ttftMs: this.getTtft(),
    }
    return this.lastRolling
  }

  finish(outputTokens: number | undefined, at = now()): Measurement | undefined {
    if (this.generationStartedAt === 0) return this.lastRolling

    const tokens =
      typeof outputTokens === "number" && outputTokens > 0
        ? outputTokens
        : this.estimatedTokens
    const elapsedMs = Math.max(MIN_RATE_SPAN_MS, at - this.generationStartedAt)

    return {
      tps: (tokens * 1000) / elapsedMs,
      tokens,
      elapsedMs,
      ttftMs: this.getTtft(),
    }
  }

  get rolling(): Measurement | undefined {
    return this.lastRolling
  }

  private getTtft(): number | undefined {
    if (this.turnStartedAt === 0 || this.generationStartedAt === 0) return
    return Math.max(0, this.generationStartedAt - this.turnStartedAt)
  }

  private prune(at: number): void {
    const cutoff = at - this.windowMs
    let firstCurrent = 0
    while (firstCurrent < this.events.length && this.events[firstCurrent].at < cutoff) {
      firstCurrent++
    }
    if (firstCurrent > 0) this.events.splice(0, firstCurrent)
  }
}

const setStatus = (
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  text: string | undefined,
): void => {
  if (!ctx.hasUI) return
  ctx.ui.setStatus(STATUS_KEY, text)
}

const formatStatus = (
  ctx: Pick<ExtensionContext, "ui">,
  measurement: Measurement | undefined,
  config: TokenSpeedConfig,
  approximate: boolean,
): string => {
  const label = ctx.ui.theme.fg("dim", "⚡ TPS:")
  if (!measurement || !Number.isFinite(measurement.tps)) return `${label} --`

  const marker = approximate ? "~" : ""
  const speed = `${marker}${measurement.tps.toFixed(1)} tok/s`
  const ttft =
    config.showTtft && measurement.ttftMs !== undefined
      ? ` · TTFT ${Math.round(measurement.ttftMs)}ms`
      : ""

  return `${label} ${speed}${ttft}`
}

export default function (pi: ExtensionAPI) {
  const tracker = new TokenSpeedTracker()
  let config = { ...DEFAULT_CONFIG }
  let lastUiUpdateAt = 0
  let pendingPromptAt: number | undefined

  const render = (
    ctx: Pick<ExtensionContext, "hasUI" | "ui">,
    measurement: Measurement | undefined,
    approximate: boolean,
    force = false,
  ): void => {
    const timestamp = now()
    if (!force && timestamp - lastUiUpdateAt < UI_UPDATE_INTERVAL_MS) return
    lastUiUpdateAt = timestamp
    setStatus(ctx, formatStatus(ctx, measurement, config, approximate))
  }

  pi.on("session_start", async (_event, ctx) => {
    config = await readConfig()
    tracker.configure(config.windowMs)
    tracker.beginTurn()
    render(ctx, undefined, true, true)
  })

  pi.on("turn_start", (_event, ctx) => {
    // The first provider response includes user-to-provider setup in TTFT. Later
    // tool-loop responses begin timing when their provider turn starts.
    tracker.beginTurn(pendingPromptAt ?? now())
    pendingPromptAt = undefined
    render(ctx, undefined, true, true)
  })

  pi.on("message_start", (event, ctx) => {
    // Capture user submission time before before_agent_start/context processing.
    // beginTurn also provides a fallback for runtimes without turn_start.
    if (event.message.role === "user") {
      pendingPromptAt = now()
      tracker.beginTurn(pendingPromptAt)
      render(ctx, undefined, true, true)
    }
  })

  pi.on("message_update", (event, ctx) => {
    const streamEvent = event.assistantMessageEvent

    if (
      streamEvent.type === "text_start" ||
      streamEvent.type === "thinking_start" ||
      streamEvent.type === "toolcall_start"
    ) {
      tracker.beginGeneration()
      return
    }

    if (
      streamEvent.type === "text_delta" ||
      streamEvent.type === "thinking_delta" ||
      streamEvent.type === "toolcall_delta"
    ) {
      const measurement = tracker.recordDelta(streamEvent.delta)
      render(ctx, measurement, true)
    }
  })

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return

    const outputTokens = event.message.usage.output
    const finalMeasurement = tracker.finish(outputTokens)
    if (config.showFinalAverage) {
      render(ctx, finalMeasurement, !(outputTokens > 0), true)
    } else {
      render(ctx, tracker.rolling ?? finalMeasurement, true, true)
    }
  })

  pi.on("session_shutdown", (_event, ctx) => {
    setStatus(ctx, undefined)
  })
}
