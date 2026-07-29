import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { basename } from "node:path"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"

const APP_NAME = "pi"
const TURN_DONE_MESSAGE = "Turn completed"
const QUESTIONNAIRE_MESSAGE = "Question waiting"
const SUPPRESS_AGENT_END_NOTIFY_ENV = "PI_SUPPRESS_AGENT_END_NOTIFY"
const COOLDOWN_MS = 5000
const LINUX_ICON = "/usr/share/icons/Yaru/256x256/apps/terminal-app.png"
const LINUX_SOUND_NAMES = ["complete", "message", "bell"]
const LINUX_SOUND_FILES = [
  "/usr/share/sounds/freedesktop/stereo/complete.oga",
  "/usr/share/sounds/freedesktop/stereo/message.oga",
  "/usr/share/sounds/freedesktop/stereo/bell.oga",
]
const LINUX_NOTIFICATION_TIMEOUT_MS = 12000

type Notification = {
  kind: string
  summary: string
  body: string
  cwd: string
  sessionId: string
  sessionFile: string
  sessionName: string
  pid: string
}

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

  const dunstMarkup = (value: string) => {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  }

  const concise = (value: string, maxLength: number) => {
    const normalized = value.replace(/\s+/g, " ").trim()
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
  }

  const displayCwd = (cwd: string) => {
    const home = process.env.HOME
    if (home && (cwd === home || cwd.startsWith(`${home}/`))) return `~${cwd.slice(home.length)}`
    return cwd
  }

  const buildNotification = (kind: string, message: string, ctx: ExtensionContext): Notification => {
    const cwd = ctx.cwd
    const sessionId = ctx.sessionManager.getSessionId()
    const sessionFile = ctx.sessionManager.getSessionFile() ?? ""
    const sessionName = ctx.sessionManager.getSessionName() ?? ""
    const project = basename(cwd) || cwd
    const label = sessionName ? `${project} · ${sessionName}` : project

    return {
      kind,
      summary: `π — ${concise(label, 80)}`,
      body: `${message}\n${concise(displayCwd(cwd), 120)} · session ${sessionId.slice(0, 8)}`,
      cwd,
      sessionId,
      sessionFile,
      sessionName,
      pid: String(process.pid),
    }
  }

  const notify = async (notification: Notification) => {
    if (process.platform === "darwin") {
      if (!(await commandExists("osascript"))) return

      const body = notification.body.replace(/\n/g, " · ")
      const script = `display notification ${appleString(body)} with title ${appleString(notification.summary)}`
      await runQuiet("osascript", ["-e", script], "osascript")

      if (await commandExists("afplay")) {
        await runQuiet("afplay", ["/System/Library/Sounds/Glass.aiff"], "afplay")
      }

      return
    }

    if (process.platform === "linux") {
      if (await commandExists("pi-notify")) {
        spawnQuiet(
          "pi-notify",
          [
            "--pid",
            notification.pid,
            "--kind",
            notification.kind,
            "--summary",
            dunstMarkup(notification.summary),
            "--body",
            dunstMarkup(notification.body),
            "--cwd",
            notification.cwd,
            "--session-id",
            notification.sessionId,
            "--session-file",
            notification.sessionFile,
            "--session-name",
            notification.sessionName,
          ],
          "pi-notify",
        )
      } else {
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
            String(LINUX_NOTIFICATION_TIMEOUT_MS),
            "--hint=string:sound-name:complete",
            dunstMarkup(notification.summary),
            dunstMarkup(notification.body),
          ],
          "notify-send",
        )
      }

      await playLinuxSound()
    }
  }

  const scheduleNotification = (key: string, kind: string, message: string, ctx: ExtensionContext) => {
    if (!shouldNotify(key)) return
    const notification = buildNotification(kind, message, ctx)

    setImmediate(() => {
      void notify(notification).catch((error) => {
        const details = error instanceof Error ? error.message : String(error)
        console.error(`[notify] notification failed: ${details}`)
      })
    })
  }

  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName !== "questionnaire" || ctx.mode !== "tui") return
    scheduleNotification("questionnaire", "questionnaire", QUESTIONNAIRE_MESSAGE, ctx)
  })

  pi.on("agent_settled", (_event, ctx) => {
    if (process.env[SUPPRESS_AGENT_END_NOTIFY_ENV] === "1") return
    scheduleNotification("agent_settled", "completed", TURN_DONE_MESSAGE, ctx)
  })
}
