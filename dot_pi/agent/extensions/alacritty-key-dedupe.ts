import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const RAW_BACKSPACE = "\x7f"
const RAW_TAB = "\t"
const DUPLICATE_WINDOW_MS = 50

const isEnvDisabled = () => process.env.PI_TUI_KITTY_KEYBOARD_FLAGS === "0"

const isEnhancedBackspacePress = (data: string) => {
  return (
    /^\x1b\[127(?:;1(?::1)?)?u$/.test(data) ||
    data === "\x1b[27;1;127~"
  )
}

const isEnhancedTabPress = (data: string) => {
  return (
    /^\x1b\[9(?:;1(?::1)?)?u$/.test(data) ||
    data === "\x1b[27;1;9~"
  )
}

export default function (pi: ExtensionAPI) {
  let unsubscribe: (() => void) | undefined

  pi.on("session_start", (_event, ctx) => {
    unsubscribe?.()
    unsubscribe = undefined

    if (!isEnvDisabled()) return

    let lastRawKey: "backspace" | "tab" | undefined
    let lastRawKeyAt = 0

    unsubscribe = ctx.ui.onTerminalInput((data) => {
      const now = Date.now()

      if (data === RAW_BACKSPACE) {
        lastRawKey = "backspace"
        lastRawKeyAt = now
        return
      }

      if (data === RAW_TAB) {
        lastRawKey = "tab"
        lastRawKeyAt = now
        return
      }

      const isDuplicateBackspace = lastRawKey === "backspace" && isEnhancedBackspacePress(data)
      const isDuplicateTab = lastRawKey === "tab" && isEnhancedTabPress(data)

      if ((isDuplicateBackspace || isDuplicateTab) && now - lastRawKeyAt <= DUPLICATE_WINDOW_MS) {
        lastRawKey = undefined
        lastRawKeyAt = 0
        return { consume: true }
      }

      lastRawKey = undefined
      lastRawKeyAt = 0
    })
  })

  pi.on("session_shutdown", () => {
    unsubscribe?.()
    unsubscribe = undefined
  })
}
