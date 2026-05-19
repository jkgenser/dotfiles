const APP_NAME = "opencode"
const TURN_DONE_MESSAGE = "Turn completed"
const COOLDOWN_MS = 5000

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

    if (process.platform === "linux" && (await commandExists("notify-send"))) {
      await $`notify-send ${APP_NAME} ${message}`.quiet()
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
