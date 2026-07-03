import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

type ServiceTierAlias = {
  targetModel: string
  serviceTier: "auto" | "default" | "flex" | "priority"
}

const SERVICE_TIER_ALIASES: Record<string, ServiceTierAlias> = {
  "openai-codex/gpt-5.5-priority": {
    targetModel: "gpt-5.5",
    serviceTier: "priority",
  },
}

type ProviderPayload = {
  model?: unknown
  service_tier?: unknown
  [key: string]: unknown
}

const isPayloadObject = (payload: unknown): payload is ProviderPayload => {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
}

export default function (pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    const model = ctx.model
    if (!model) return

    const alias = SERVICE_TIER_ALIASES[`${model.provider}/${model.id}`]
    if (!alias) return
    if (!isPayloadObject(event.payload)) return

    return {
      ...event.payload,
      // Pi displays/saves the alias model, but OpenAI Codex receives the real model id.
      model: alias.targetModel,
      service_tier: event.payload.service_tier ?? alias.serviceTier,
    }
  })
}
