const APP_NAME = "opencode"
const TURN_DONE_MESSAGE = "Turn completed"
const COOLDOWN_MS = 5000
const LINUX_ICON = "/usr/share/icons/Yaru/256x256/apps/terminal-app.png"
const LINUX_SOUND_NAMES = ["complete", "message", "bell"]
const LINUX_SOUND_FILES = [
  "/usr/share/sounds/freedesktop/stereo/complete.oga",
  "/usr/share/sounds/freedesktop/stereo/message.oga",
  "/usr/share/sounds/freedesktop/stereo/bell.oga",
]

export const NotificationPlugin = async ({ $ }) => {
  const mainSessions = new Set()
  const lastNotification = new Map()

  const commandExists = async (command) => {
    try {
      await $`command -v ${command}`.quiet()
      return true
    } catch {
      return false
    }
  }

  const shouldNotify = (key) => {
    const now = Date.now()
    const last = lastNotification.get(key) ?? 0

    if (now - last < COOLDOWN_MS) return false

    lastNotification.set(key, now)
    return true
  }

  const runQuiet = async (command, label) => {
    try {
      await command.quiet()
      return true
    } catch (error) {
      console.error(`[notify] ${label} failed: ${error.message}`)
      return false
    }
  }

  const fileExists = async (path) => {
    try {
      await $`test -r ${path}`.quiet()
      return true
    } catch {
      return false
    }
  }

  const playLinuxSound = async () => {
    if (await commandExists("canberra-gtk-play")) {
      for (const name of LINUX_SOUND_NAMES) {
        if (await runQuiet($`canberra-gtk-play -i ${name}`, `canberra-gtk-play ${name}`)) return
      }
    }

    const players = ["pw-play", "paplay"]
    for (const player of players) {
      if (!(await commandExists(player))) continue

      for (const path of LINUX_SOUND_FILES) {
        if (!(await fileExists(path))) continue
        if (await runQuiet($`${player} ${path}`, `${player} ${path}`)) return
      }
    }
  }

  const appleString = (value) => {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }

  const notify = async (message) => {
    if (process.platform === "darwin") {
      if (!(await commandExists("osascript"))) return

      const script = `display notification ${appleString(message)} with title ${appleString(APP_NAME)}`
      await $`osascript -e ${script}`.quiet()

      if (await commandExists("afplay")) {
        await $`afplay /System/Library/Sounds/Glass.aiff`.quiet().catch(() => {})
      }

      return
    }

    if (process.platform === "linux") {
      if (await commandExists("notify-send")) {
        await runQuiet(
          $`notify-send --app-name ${APP_NAME} --icon ${LINUX_ICON} --urgency normal --expire-time 10000 --hint=string:sound-name:complete ${APP_NAME} ${message}`,
          "notify-send",
        )
      }

      await playLinuxSound()
    }
  }

  const getProperties = (event) => event.properties ?? {}
  const getInfo = (event) => getProperties(event).info ?? getProperties(event).session ?? {}
  const getSessionID = (event) => {
    const properties = getProperties(event)
    const info = getInfo(event)

    return properties.sessionID ?? properties.sessionId ?? info.id ?? properties.id
  }
  const getParentID = (event) => {
    const properties = getProperties(event)
    const info = getInfo(event)

    return info.parentID ?? info.parentId ?? properties.parentID ?? properties.parentId
  }
  const isMainSession = (event) => {
    const sessionID = getSessionID(event)

    if (!sessionID) return true
    return mainSessions.has(sessionID)
  }

  return {
    event: async ({ event }) => {
      const sessionID = getSessionID(event)

      if (event.type === "session.created" && sessionID && getParentID(event) == null) {
        mainSessions.add(sessionID)
        return
      }

      if (event.type === "session.deleted" && sessionID) {
        mainSessions.delete(sessionID)
        lastNotification.delete(`idle:${sessionID}`)
        return
      }

      const becameIdle =
        event.type === "session.idle" ||
        (event.type === "session.status" && getProperties(event).status?.type === "idle")

      if (becameIdle && isMainSession(event) && shouldNotify(`idle:${sessionID ?? "unknown"}`)) {
        await notify(TURN_DONE_MESSAGE)
        return
      }

      if (event.type === "permission.asked" && shouldNotify("permission")) {
        await notify("Permission required")
        return
      }

      if (event.type === "question.asked" && shouldNotify("question")) {
        await notify("Question waiting")
      }
    },
  }
}
