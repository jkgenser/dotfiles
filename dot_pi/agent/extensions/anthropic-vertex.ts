import { spawnSync } from "node:child_process"
import {
  getApiProvider,
  getModels,
  type AnthropicMessagesCompat,
  type AnthropicOptions,
  type Api,
  type Model,
  type ProviderHeaders,
  type SimpleStreamOptions,
  type ThinkingBudgets,
  type ThinkingLevel,
} from "@earendil-works/pi-ai/compat"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const PROVIDER_ID = "anthropic-vertex"
const API_ID = "anthropic-vertex"
const ANTHROPIC_VERSION = "vertex-2023-10-16"
const INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14"
const TOKEN_CACHE_MS = 50 * 60 * 1000
const TOKEN_COMMAND_TIMEOUT_MS = 15_000
const DEFAULT_LOCATION = "global"

const TARGET_MODEL_IDS = new Set([
  "claude-opus-4-6",
  "claude-opus-4-8",
  "claude-fable-5",
])

type VertexRequestOptions = {
  signal?: AbortSignal
  timeout?: number
  maxRetries?: number
}

type MessagesCreateParams = Record<string, unknown> & {
  model?: unknown
  stream?: unknown
}

type TokenCache = {
  token: string
  expiresAt: number
}

type VertexLocation = {
  location: string
  host: string
}

let tokenCache: TokenCache | undefined

const env = (...names: string[]): string | undefined => {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
}

const getProject = (): string | undefined =>
  env("ANTHROPIC_VERTEX_PROJECT_ID", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT")

const getLocation = (): string =>
  env(
    "ANTHROPIC_VERTEX_LOCATION",
    "ANTHROPIC_VERTEX_REGION",
    "GOOGLE_CLOUD_LOCATION",
    "CLOUD_ML_REGION",
  ) ?? DEFAULT_LOCATION

const resolveVertexLocation = (location: string): VertexLocation => {
  if (location === "global") return { location, host: "aiplatform.googleapis.com" }
  if (location === "us" || location === "eu") return { location, host: `aiplatform.${location}.rep.googleapis.com` }
  return { location, host: `${location}-aiplatform.googleapis.com` }
}

const getBaseUrl = (location: string): string => `https://${resolveVertexLocation(location).host}`

const runCommand = (command: string, args: string[], timeout = TOKEN_COMMAND_TIMEOUT_MS): string => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  })

  if (result.status === 0) return result.stdout.trim()

  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : ""
  const error = result.error?.message
  const suffix = [stderr, error].filter(Boolean).join("; ")
  throw new Error(`${command} ${args.join(" ")} failed${suffix ? `: ${suffix}` : ""}`)
}

const runShellCommand = (command: string): string => {
  const result = spawnSync("sh", ["-lc", command], {
    encoding: "utf8",
    timeout: TOKEN_COMMAND_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  })

  if (result.status === 0) return result.stdout.trim()

  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : ""
  const error = result.error?.message
  const suffix = [stderr, error].filter(Boolean).join("; ")
  throw new Error(`ANTHROPIC_VERTEX_ACCESS_TOKEN_COMMAND failed${suffix ? `: ${suffix}` : ""}`)
}

const getAccessToken = (): string => {
  const explicitToken = env("ANTHROPIC_VERTEX_ACCESS_TOKEN", "GOOGLE_OAUTH_ACCESS_TOKEN")
  if (explicitToken) return explicitToken

  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token

  const tokenCommand = env("ANTHROPIC_VERTEX_ACCESS_TOKEN_COMMAND")
  const token = tokenCommand ? runShellCommand(tokenCommand) : getGcloudAccessToken()

  if (!token || token.length < 20) {
    throw new Error(
      "Could not obtain a Google access token. Run `gcloud auth application-default login` " +
        "or set ANTHROPIC_VERTEX_ACCESS_TOKEN_COMMAND.",
    )
  }

  tokenCache = { token, expiresAt: now + TOKEN_CACHE_MS }
  return token
}

const getGcloudAccessToken = (): string => {
  const gcloud = env("ANTHROPIC_VERTEX_GCLOUD_PATH", "VERTEX_GCLOUD_PATH") ?? "gcloud"
  const failures: string[] = []

  for (const args of [
    ["auth", "application-default", "print-access-token"],
    ["auth", "print-access-token"],
  ]) {
    try {
      const token = runCommand(gcloud, args)
      if (token) return token
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  throw new Error(`Failed to obtain gcloud access token. ${failures.join(" | ")}`)
}

const providerHeadersToRecord = (headers?: ProviderHeaders): Record<string, string> => {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value !== null) record[key] = value
  }
  return record
}

const withVertexBetaHeaders = (isAdaptive: boolean, requestHeaders?: ProviderHeaders): Record<string, string> => {
  const headers = providerHeadersToRecord(requestHeaders)
  const betaHeaders: string[] = []

  if (!isAdaptive) betaHeaders.push(INTERLEAVED_THINKING_BETA)
  if (headers["anthropic-beta"]) {
    betaHeaders.push(
      ...headers["anthropic-beta"]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
  }

  if (betaHeaders.length > 0) headers["anthropic-beta"] = [...new Set(betaHeaders)].join(",")
  else delete headers["anthropic-beta"]

  return headers
}

const combineSignals = (signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | undefined => {
  if (!timeoutMs || timeoutMs <= 0) return signal

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!signal) return timeoutSignal

  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeoutSignal])

  return signal
}

class AnthropicVertexMessagesShim {
  readonly messages = {
    create: (params: MessagesCreateParams, requestOptions?: VertexRequestOptions) => ({
      asResponse: () => this.createMessagesResponse(params, requestOptions),
    }),
  }

  constructor(
    private readonly project: string,
    private readonly location: string,
    private readonly defaultHeaders: Record<string, string>,
  ) {}

  private async createMessagesResponse(
    params: MessagesCreateParams,
    requestOptions?: VertexRequestOptions,
  ): Promise<Response> {
    const modelId = params.model
    if (typeof modelId !== "string" || modelId.length === 0) {
      throw new Error("Anthropic Vertex request is missing params.model")
    }

    const { model: _model, ...body } = params
    const { location, host } = resolveVertexLocation(this.location)
    const url =
      `https://${host}/v1/projects/${encodeURIComponent(this.project)}` +
      `/locations/${encodeURIComponent(location)}` +
      `/publishers/anthropic/models/${encodeURIComponent(modelId)}:streamRawPredict`

    return fetch(url, {
      method: "POST",
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${getAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        anthropic_version: ANTHROPIC_VERSION,
        stream: true,
      }),
      signal: combineSignals(requestOptions?.signal, requestOptions?.timeout),
    })
  }
}

const mapStreamToAnthropicOptions = (
  client: AnthropicVertexMessagesShim,
  options: SimpleStreamOptions | undefined,
  model: Model<Api>,
): AnthropicOptions => ({
  client: client as unknown as AnthropicOptions["client"],
  maxTokens: options?.maxTokens,
  temperature: options?.temperature,
  signal: options?.signal,
  apiKey: options?.apiKey,
  transport: options?.transport,
  cacheRetention: options?.cacheRetention,
  sessionId: options?.sessionId,
  headers: options?.headers,
  onPayload: options?.onPayload,
  onResponse: options?.onResponse,
  timeoutMs: options?.timeoutMs,
  websocketConnectTimeoutMs: options?.websocketConnectTimeoutMs,
  maxRetries: options?.maxRetries,
  maxRetryDelayMs: options?.maxRetryDelayMs,
  metadata: options?.metadata,
  env: options?.env,
  ...buildThinkingOptions(options?.maxTokens, options, model),
})

const buildThinkingOptions = (
  maxTokens: number | undefined,
  options: SimpleStreamOptions | undefined,
  model: Model<Api>,
): {
  thinkingEnabled: boolean
  effort?: AnthropicOptions["effort"]
  thinkingBudgetTokens?: number
  maxTokens?: number
} => {
  if (!options?.reasoning || !model.reasoning) return { thinkingEnabled: false }

  const modelCompat = model.compat as AnthropicMessagesCompat | undefined
  if (modelCompat?.forceAdaptiveThinking === true) {
    return {
      thinkingEnabled: true,
      effort: mapThinkingLevelToEffort(model, options.reasoning),
    }
  }

  const adjusted = adjustMaxTokensForThinking(
    maxTokens,
    model.maxTokens,
    options.reasoning,
    options.thinkingBudgets,
  )

  return {
    thinkingEnabled: true,
    maxTokens: adjusted.maxTokens,
    thinkingBudgetTokens: adjusted.thinkingBudget,
  }
}

const mapThinkingLevelToEffort = (
  model: Model<Api>,
  level: SimpleStreamOptions["reasoning"],
): AnthropicOptions["effort"] => {
  const mapped = level ? model.thinkingLevelMap?.[level] : undefined
  if (typeof mapped === "string") return mapped as AnthropicOptions["effort"]

  switch (level) {
    case "minimal":
    case "low":
      return "low"
    case "medium":
      return "medium"
    case "high":
      return "high"
    default:
      return "high"
  }
}

const clampReasoning = (effort: ThinkingLevel): Exclude<ThinkingLevel, "xhigh"> =>
  effort === "xhigh" ? "high" : effort

const adjustMaxTokensForThinking = (
  baseMaxTokens: number | undefined,
  modelMaxTokens: number,
  reasoningLevel: ThinkingLevel,
  customBudgets?: ThinkingBudgets,
): { maxTokens: number; thinkingBudget: number } => {
  const defaultBudgets: ThinkingBudgets = {
    minimal: 1024,
    low: 2048,
    medium: 8192,
    high: 16384,
  }
  const budgets = { ...defaultBudgets, ...customBudgets }
  const minOutputTokens = 1024
  const level = clampReasoning(reasoningLevel)
  let thinkingBudget = budgets[level]!
  const maxTokens =
    baseMaxTokens === undefined ? modelMaxTokens : Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens)

  if (maxTokens <= thinkingBudget) thinkingBudget = Math.max(0, maxTokens - minOutputTokens)

  return { maxTokens, thinkingBudget }
}

export default function (pi: ExtensionAPI) {
  const project = getProject()
  const location = getLocation()

  if (!project) {
    console.warn(
      `[${PROVIDER_ID}] disabled: set ANTHROPIC_VERTEX_PROJECT_ID, GOOGLE_CLOUD_PROJECT, or GCLOUD_PROJECT`,
    )
    return
  }

  const anthropicApi = getApiProvider("anthropic-messages")
  if (!anthropicApi) throw new Error("Built-in anthropic-messages provider not found")

  const models = getModels("anthropic")
    .filter((model) => TARGET_MODEL_IDS.has(model.id))
    .map(({ id, name, compat, reasoning, thinkingLevelMap, input, cost, contextWindow, maxTokens }) => ({
      id,
      name: `${name} (Vertex AI)`,
      compat,
      reasoning,
      thinkingLevelMap,
      input,
      cost,
      contextWindow,
      maxTokens,
    }))

  if (models.length === 0) {
    console.warn(`[${PROVIDER_ID}] disabled: no matching built-in Anthropic models found`)
    return
  }

  pi.registerProvider(PROVIDER_ID, {
    name: "Anthropic on Vertex AI",
    baseUrl: getBaseUrl(location),
    apiKey: project,
    api: API_ID,
    models,
    streamSimple: (model: Model<Api>, context, options?: SimpleStreamOptions) => {
      const modelCompat = model.compat as AnthropicMessagesCompat | undefined
      const isAdaptive = modelCompat?.forceAdaptiveThinking === true
      const client = new AnthropicVertexMessagesShim(
        project,
        location,
        withVertexBetaHeaders(isAdaptive, options?.headers),
      )
      const anthropicOptions = mapStreamToAnthropicOptions(client, options, model)
      const patchedModel = { ...model, api: "anthropic-messages" as Api }

      return anthropicApi.stream(patchedModel, context, anthropicOptions)
    },
  })

  pi.on("session_start", (_event, ctx) => {
    ctx.ui?.notify(
      `Anthropic Vertex enabled (${project}, ${location}). Models: ${models.map((model) => model.id).join(", ")}`,
      "info",
    )
  })
}
