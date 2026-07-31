import {
  compact,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent"

const COMPACTION_PROVIDER = "openai-codex"
const COMPACTION_MODEL = "gpt-5.6-luna"
const COMPACTION_MODEL_KEY = `${COMPACTION_PROVIDER}/${COMPACTION_MODEL}`

const notify = (
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void => {
  if (!ctx.hasUI) return
  ctx.ui.notify(message, level)
}

const getActiveModelKey = (ctx: Pick<ExtensionContext, "model">): string => {
  return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "active model"
}

export default function (pi: ExtensionAPI) {
  let useCurrentModelOnce = false
  let pendingCompactionModel: string | undefined

  pi.registerCommand("compact-current", {
    description: "Compact once with the active model (optional instructions)",
    handler: async (args, ctx) => {
      await ctx.waitForIdle()
      useCurrentModelOnce = true

      ctx.compact({
        customInstructions: args.trim() || undefined,
        onError: (error) => {
          useCurrentModelOnce = false
          pendingCompactionModel = undefined
          notify(ctx, `Compaction failed: ${error.message}`, "error")
        },
      })
    },
  })

  pi.on("session_before_compact", async (event, ctx) => {
    if (useCurrentModelOnce) {
      useCurrentModelOnce = false
      pendingCompactionModel = getActiveModelKey(ctx)
      notify(ctx, `Compacting with ${pendingCompactionModel}`, "info")
      return
    }

    const model = ctx.modelRegistry.find(COMPACTION_PROVIDER, COMPACTION_MODEL)
    if (!model) {
      pendingCompactionModel = getActiveModelKey(ctx)
      notify(ctx, `${COMPACTION_MODEL_KEY} is unavailable; using ${pendingCompactionModel}`, "warning")
      return
    }

    const provider = ctx.modelRegistry.getProvider(COMPACTION_PROVIDER)
    if (!provider) {
      pendingCompactionModel = getActiveModelKey(ctx)
      notify(ctx, `${COMPACTION_PROVIDER} is unavailable; using ${pendingCompactionModel}`, "warning")
      return
    }

    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model)
      if (!auth.ok) {
        pendingCompactionModel = getActiveModelKey(ctx)
        notify(ctx, `Luna compaction auth failed; using ${pendingCompactionModel}: ${auth.error}`, "warning")
        return
      }

      pendingCompactionModel = COMPACTION_MODEL_KEY
      notify(ctx, `Compacting with ${pendingCompactionModel}`, "info")

      const result = await compact(
        event.preparation,
        model,
        auth.apiKey,
        auth.headers,
        event.customInstructions,
        event.signal,
        ctx.thinkingLevel,
        provider.streamSimple.bind(provider),
        auth.env,
      )

      return {
        compaction: {
          ...result,
          details: {
            ...result.details,
            compactionModel: COMPACTION_MODEL_KEY,
          },
        },
      }
    } catch (error) {
      if (event.signal.aborted) {
        pendingCompactionModel = undefined
        return
      }

      pendingCompactionModel = getActiveModelKey(ctx)
      const message = error instanceof Error ? error.message : String(error)
      notify(ctx, `Luna compaction failed; using ${pendingCompactionModel}: ${message}`, "warning")
      return
    }
  })

  pi.on("session_compact", (_event, ctx) => {
    const modelKey = pendingCompactionModel ?? getActiveModelKey(ctx)
    pendingCompactionModel = undefined
    notify(ctx, `Compaction completed with ${modelKey}`, "info")
  })
}
