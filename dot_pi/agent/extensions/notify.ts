import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const APP_NAME = "pi"
const TURN_DONE_MESSAGE = "Turn completed"
const COOLDOWN_MS = 5000
const LINUX_ICON = "/usr/share/icons/Yaru/256x256/apps/terminal-app.png"
const LINUX_SOUND_NAMES = ["complete", "message", "bell"]
const LINUX_SOUND_FILES = [
  "/usr/share/sounds/freedesktop/stereo/complete.oga",
  "/usr/share/sounds/freedesktop/stereo/message.oga",
  "/usr/share/sounds/freedesktop/stereo/bell.oga",
]

export default function (pi: ExtensionAPI) {
  const lastNotification = new Map<string, number>()

  const shouldNotify = (key: string) => {
    const now = Date.now()
    const last = lastNotification.get(key) ?? 0

    if (now - last < COOLDOWN_MS) return false

    lastNotification.set(key, now)
    return true
  }

  const spawnQuiet = (command: string, args: string[], label: string) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" })
      child.on("error", (error) => console.error(`[notify] ${label} failed: ${error.message}`))
      child.unref()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[notify] ${label} failed: ${message}`)
      return false
    }
  }

  const commandCache = new Map<string, Promise<boolean> | boolean>()

  const commandExists = async (command: string) => {
    const cached = commandCache.get(command)
    if (typeof cached === "boolean") return cached
    if (cached) return cached

    const check = new Promise<boolean>((resolve) => {
      const child = spawn("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" })
      child.on("error", () => resolve(false))
      child.on("close", (code) => resolve(code === 0))
    })

    commandCache.set(command, check)
    const exists = await check
    commandCache.set(command, exists)
    return exists
  }

  const fileExists = async (path: string) => {
    try {
      await access(path, constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  const runQuiet = async (command: string, args: string[], label: string) => {
    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      try {
        const child = spawn(command, args, { stdio: "ignore" })
        child.on("error", (error) => {
          console.error(`[notify] ${label} failed: ${error.message}`)
          settle(false)
        })
        child.on("close", (code) => {
          if (code === 0) {
            settle(true)
            return
          }
          console.error(`[notify] ${label} exited with status ${code}`)
          settle(false)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[notify] ${label} failed: ${message}`)
        settle(false)
      }
    })
  }

  const playLinuxSound = async () => {
    if (await commandExists("canberra-gtk-play")) {
      for (const name of LINUX_SOUND_NAMES) {
        if (await runQuiet("canberra-gtk-play", ["-i", name], `canberra-gtk-play ${name}`)) return
      }
    }

    for (const player of ["pw-play", "paplay"]) {
      if (!(await commandExists(player))) continue

      for (const path of LINUX_SOUND_FILES) {
        if (!(await fileExists(path))) continue
        if (await runQuiet(player, [path], `${player} ${path}`)) return
      }
    }
  }

  const appleString = (value: string) => {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }

  const notify = async (message: string) => {
    if (process.platform === "darwin") {
      if (!(await commandExists("osascript"))) return

      const script = `display notification ${appleString(message)} with title ${appleString(APP_NAME)}`
      await runQuiet("osascript", ["-e", script], "osascript")

      if (await commandExists("afplay")) {
        await runQuiet("afplay", ["/System/Library/Sounds/Glass.aiff"], "afplay")
      }

      return
    }

    if (process.platform === "linux") {
      spawnQuiet(
        "notify-send",
        [
          "--app-name",
          APP_NAME,
          "--icon",
          LINUX_ICON,
          "--urgency",
          "normal",
          "--expire-time",
          "10000",
          "--hint=string:sound-name:complete",
          APP_NAME,
          message,
        ],
        "notify-send",
      )

      await playLinuxSound()
    }
  }

  pi.on("agent_end", () => {
    if (!shouldNotify("agent_end")) return

    setImmediate(() => {
      void notify(TURN_DONE_MESSAGE).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[notify] notification failed: ${message}`)
      })
    })
  })
}
