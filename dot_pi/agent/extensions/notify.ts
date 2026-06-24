import { spawn, spawnSync } from "node:child_process"
import { accessSync, constants } from "node:fs"
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

  const commandExists = async (command: string) => {
    return spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0
  }

  const fileExists = async (path: string) => {
    try {
      accessSync(path, constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  const runQuiet = async (command: string, args: string[], label: string) => {
    const result = spawnSync(command, args, { stdio: "ignore" })

    if (result.status === 0) return true

    if (result.error) {
      console.error(`[notify] ${label} failed: ${result.error.message}`)
      return false
    }

    console.error(`[notify] ${label} exited with status ${result.status}`)
    return false
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

  pi.on("agent_end", async () => {
    if (shouldNotify("agent_end")) await notify(TURN_DONE_MESSAGE)
  })
}
