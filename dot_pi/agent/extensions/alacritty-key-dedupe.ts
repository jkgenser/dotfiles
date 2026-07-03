import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { matchesKey } from "@earendil-works/pi-tui"

type DedupeKey = "backspace" | "enter" | "tab"

const DUPLICATE_WINDOW_MS = 75

const isEnvDisabled = () => process.env.PI_TUI_KITTY_KEYBOARD_FLAGS === "0"

const dedupeKey = (data: string): DedupeKey | undefined => {
  if (matchesKey(data, "backspace")) return "backspace"
  if (matchesKey(data, "enter")) return "enter"
  if (matchesKey(data, "tab")) return "tab"
}

export default function (pi: ExtensionAPI) {
  let unsubscribe: (() => void) | undefined

  pi.on("session_start", (_event, ctx) => {
    unsubscribe?.()
    unsubscribe = undefined

    if (!isEnvDisabled()) return

    let lastKey: DedupeKey | undefined
    let lastKeyAt = 0

    unsubscribe = ctx.ui.onTerminalInput((data) => {
      const now = Date.now()
      const key = dedupeKey(data)

      if (!key) {
        lastKey = undefined
        lastKeyAt = 0
        return
      }

      if (key === lastKey && now - lastKeyAt <= DUPLICATE_WINDOW_MS) {
        lastKey = undefined
        lastKeyAt = 0
        return { consume: true }
      }

      lastKey = key
      lastKeyAt = now
    })
  })

  pi.on("session_shutdown", () => {
    unsubscribe?.()
    unsubscribe = undefined
  })
}
