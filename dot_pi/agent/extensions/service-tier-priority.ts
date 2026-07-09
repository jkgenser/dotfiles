import { promises as fs } from "node:fs"
import { dirname, join } from "node:path"
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"

type ServiceTier = "auto" | "default" | "flex" | "priority"

type FastTarget = {
  serviceTier: ServiceTier
}

type ProviderPayload = {
  service_tier?: unknown
  [key: string]: unknown
}

type FastModeConfig = {
  enabled: boolean
}

const STATUS_KEY = "fast-mode"
const CONFIG_PATH = join(getAgentDir(), "extensions", "fast-mode", "config.json")

const FAST_TARGETS: Record<string, FastTarget> = {
  "openai/gpt-5.4": { serviceTier: "priority" },
  "openai/gpt-5.5": { serviceTier: "priority" },
  "openai/gpt-5.6": { serviceTier: "priority" },
  "openai/gpt-5.6-luna": { serviceTier: "priority" },
  "openai/gpt-5.6-sol": { serviceTier: "priority" },
  "openai/gpt-5.6-terra": { serviceTier: "priority" },
  "openai-codex/gpt-5.4": { serviceTier: "priority" },
  "openai-codex/gpt-5.5": { serviceTier: "priority" },
  "openai-codex/gpt-5.6-luna": { serviceTier: "priority" },
  "openai-codex/gpt-5.6-sol": { serviceTier: "priority" },
  "openai-codex/gpt-5.6-terra": { serviceTier: "priority" },
}

const isPayloadObject = (payload: unknown): payload is ProviderPayload => {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
}

const getModelKey = (model: unknown): string | undefined => {
  if (typeof model !== "object" || model === null || Array.isArray(model)) return

  const candidate = model as { provider?: unknown; id?: unknown }
  if (typeof candidate.provider !== "string") return
  if (typeof candidate.id !== "string") return

  return `${candidate.provider}/${candidate.id}`
}

const parseFastCommand = (args: string, currentEnabled: boolean): boolean => {
  const normalized = args.trim().toLowerCase()

  if (normalized === "" || normalized === "toggle") return !currentEnabled
  if (normalized === "on") return true
  if (normalized === "off") return false

  throw new Error("Usage: /fast [on|off|toggle]")
}

const getFastCommandCompletions = (argumentPrefix: string) => {
  const prefix = argumentPrefix.trim().toLowerCase()
  return ["on", "off", "toggle"]
    .filter((option) => option.startsWith(prefix))
    .map((value) => ({ value, label: value }))
}

const readConfig = async (): Promise<FastModeConfig> => {
  try {
    const json = await fs.readFile(CONFIG_PATH, "utf8")
    const parsed = JSON.parse(json) as Partial<FastModeConfig>
    return { enabled: parsed.enabled === true }
  } catch {
    return { enabled: false }
  }
}

const writeConfig = async (config: FastModeConfig): Promise<void> => {
  await fs.mkdir(dirname(CONFIG_PATH), { recursive: true })
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

const notify = (
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void => {
  if (!ctx.hasUI) return
  ctx.ui.notify(message, level)
}

const clearStatus = (ctx: Pick<ExtensionContext, "hasUI" | "ui">): void => {
  if (!ctx.hasUI) return
  ctx.ui.setStatus?.(STATUS_KEY, undefined)
}

const updateStatus = (
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  enabled: boolean,
  modelKey: string | undefined,
): void => {
  if (!ctx.hasUI) return
  ctx.ui.setStatus?.(STATUS_KEY, enabled && modelKey && FAST_TARGETS[modelKey] ? "fast" : undefined)
}

export default function (pi: ExtensionAPI) {
  let config: FastModeConfig = { enabled: false }
  let loaded = false
  let currentModelKey: string | undefined

  const ensureLoaded = async (): Promise<void> => {
    if (loaded) return
    config = await readConfig()
    loaded = true
  }

  pi.registerCommand("fast", {
    description: "Toggle OpenAI priority service tier. Usage: /fast [on|off|toggle]",
    getArgumentCompletions: getFastCommandCompletions,
    handler: async (args, ctx) => {
      try {
        await ensureLoaded()
        currentModelKey = getModelKey(ctx.model) ?? currentModelKey
        config.enabled = parseFastCommand(args, config.enabled)
        await writeConfig(config)
        updateStatus(ctx, config.enabled, currentModelKey)

        const active = currentModelKey && FAST_TARGETS[currentModelKey]
        const suffix = config.enabled && !active ? " (not active for current model)" : ""
        notify(ctx, `Fast Mode ${config.enabled ? "enabled" : "disabled"}${suffix}`)
      } catch (error) {
        notify(ctx, error instanceof Error ? error.message : String(error), "error")
      }
    },
  })

  pi.on("session_start", async (_event, ctx) => {
    await ensureLoaded()
    currentModelKey = getModelKey(ctx.model)
    updateStatus(ctx, config.enabled, currentModelKey)
  })

  pi.on("model_select", (event, ctx) => {
    currentModelKey = getModelKey(event.model) ?? getModelKey(ctx.model)
    updateStatus(ctx, config.enabled, currentModelKey)
  })

  pi.on("before_provider_request", async (event, ctx) => {
    await ensureLoaded()
    if (!config.enabled) return

    const modelKey = getModelKey(ctx.model) ?? currentModelKey
    const target = modelKey ? FAST_TARGETS[modelKey] : undefined
    if (!target) return
    if (!isPayloadObject(event.payload)) return

    return {
      ...event.payload,
      service_tier: target.serviceTier,
    }
  })

  pi.on("session_shutdown", (_event, ctx) => {
    clearStatus(ctx)
  })
}
