import assert from "node:assert/strict"
import test from "node:test"
import {
  formatStatusline,
  normalizeAppServerResponse,
  normalizeBackendPayload,
} from "../index.ts"
import { DAY_MS, MINUTE_MS, WEEK_MS } from "../pace.ts"

const now = Date.parse("2026-07-13T00:00:00.000Z")
const resetAtSeconds = (now + WEEK_MS / 2) / 1000

const plainThemeContext = {
  ui: {
    theme: {
      fg: (_color: string, value: string) => value,
    },
  },
} as never

test("normalizes a direct weekly-only primary window", () => {
  const report = normalizeBackendPayload(
    {
      rate_limit: {
        primary_window: {
          used_percent: 60,
          limit_window_seconds: WEEK_MS / 1000,
          reset_at: resetAtSeconds,
        },
        secondary_window: null,
      },
    },
    now,
  )

  assert.deepEqual(report.snapshots[0]?.primary, {
    usedPercent: 60,
    durationMs: WEEK_MS,
    resetAtMs: now + WEEK_MS / 2,
  })
})

test("normalizes app-server duration and reset fields", () => {
  const report = normalizeAppServerResponse(
    {
      rateLimits: {
        limitId: "codex",
        primary: {
          usedPercent: 60,
          windowDurationMins: WEEK_MS / MINUTE_MS,
          resetsAt: resetAtSeconds,
        },
        secondary: null,
      },
    },
    now,
  )

  assert.deepEqual(report.snapshots[0]?.primary, {
    usedPercent: 60,
    durationMs: WEEK_MS,
    resetAtMs: now + WEEK_MS / 2,
  })
})

test("formats separate time and usage bars with pace delta", () => {
  const report = normalizeBackendPayload(
    {
      rate_limit: {
        primary_window: {
          used_percent: 60,
          limit_window_seconds: WEEK_MS / 1000,
          reset_at: resetAtSeconds,
        },
      },
    },
    now,
  )

  assert.equal(
    formatStatusline(report, plainThemeContext, now),
    "codex t █████░░░░░ 50% u ██████░░░░ 60% +10pp 3.5d",
  )
})

test("uses a usage-only fallback when period metadata is unavailable", () => {
  assert.equal(
    formatStatusline(
      {
        snapshots: [
          {
            limitId: "codex",
            primary: { usedPercent: 25, resetAtMs: now + 2 * DAY_MS },
          },
        ],
      },
      plainThemeContext,
      now,
    ),
    "codex u ██▌░░░░░░░ 25% 2d",
  )
})
