import assert from "node:assert/strict"
import test from "node:test"
import {
  calculatePace,
  DAY_MS,
  formatPaceDelta,
  formatProgressBar,
  formatResetCountdown,
  HOUR_MS,
  MINUTE_MS,
  selectWeeklyWindow,
  WEEK_MS,
  type UsageReport,
} from "../pace.ts"

const now = Date.parse("2026-07-13T00:00:00.000Z")

test("selects weekly by duration rather than primary/secondary position", () => {
  const dual: UsageReport = {
    snapshots: [
      {
        limitId: "codex",
        primary: { usedPercent: 8, durationMs: 5 * HOUR_MS },
        secondary: { usedPercent: 60, durationMs: WEEK_MS },
      },
    ],
  }
  assert.equal(selectWeeklyWindow(dual)?.usedPercent, 60)

  const weeklyOnly: UsageReport = {
    snapshots: [
      {
        limitId: "codex",
        primary: { usedPercent: 61, durationMs: WEEK_MS },
      },
    ],
  }
  assert.equal(selectWeeklyWindow(weeklyOnly)?.usedPercent, 61)
})

test("accepts a sole duration-less window but rejects a known short-only window", () => {
  assert.equal(
    selectWeeklyWindow({
      snapshots: [{ limitId: "codex", primary: { usedPercent: 12 } }],
    })?.usedPercent,
    12,
  )
  assert.equal(
    selectWeeklyWindow({
      snapshots: [
        {
          limitId: "codex",
          primary: { usedPercent: 12, durationMs: 5 * HOUR_MS },
        },
      ],
    }),
    undefined,
  )
})

test("calculates elapsed period and usage delta", () => {
  const pace = calculatePace(
    {
      usedPercent: 60,
      durationMs: WEEK_MS,
      resetAtMs: now + WEEK_MS / 2,
    },
    now,
  )

  assert.ok(pace)
  assert.equal(pace.elapsedPercent, 50)
  assert.equal(pace.usedPercent, 60)
  assert.equal(pace.deltaPercentagePoints, 10)
})

test("clamps elapsed period around reset boundaries", () => {
  assert.equal(
    calculatePace(
      { usedPercent: 1, durationMs: WEEK_MS, resetAtMs: now + 2 * WEEK_MS },
      now,
    )?.elapsedPercent,
    0,
  )
  assert.equal(
    calculatePace(
      { usedPercent: 80, durationMs: WEEK_MS, resetAtMs: now - MINUTE_MS },
      now,
    )?.elapsedPercent,
    100,
  )
})

test("formats fixed-width bars with partial-cell precision", () => {
  assert.equal(formatProgressBar(0), "░░░░░░░░░░")
  assert.equal(formatProgressBar(50), "█████░░░░░")
  assert.equal(formatProgressBar(55), "█████▌░░░░")
  assert.equal(formatProgressBar(60), "██████░░░░")
  assert.equal(formatProgressBar(100), "██████████")
})

test("formats pacing deltas with tolerance", () => {
  assert.equal(formatPaceDelta(2.9), "pace")
  assert.equal(formatPaceDelta(10), "+10pp")
  assert.equal(formatPaceDelta(-10), "−10pp")
})

test("formats compact reset countdown", () => {
  assert.equal(formatResetCountdown(now + 3.5 * DAY_MS, now), "3.5d")
  assert.equal(formatResetCountdown(now + 23.5 * HOUR_MS, now), "23.5h")
  assert.equal(formatResetCountdown(now + 59 * MINUTE_MS, now), "59m")
  assert.equal(formatResetCountdown(now - MINUTE_MS, now), "0s")
})
