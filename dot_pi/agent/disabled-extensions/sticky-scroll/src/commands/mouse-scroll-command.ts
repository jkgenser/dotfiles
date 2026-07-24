export interface StickyMouseScrollConfig {
  mouseScroll: boolean;
  alternateScroll: boolean;
}

export type StickyInputCommandAction =
  | { type: "toggle" }
  | { type: "setMouseScroll"; enabled: boolean }
  | { type: "status" }
  | { type: "help" }
  | { type: "error"; message: string };

const ENABLE_TOKENS = new Set(["on", "enable", "enabled", "mouse", "scroll"]);
const DISABLE_TOKENS = new Set(["off", "disable", "disabled", "native", "select", "selection", "links"]);
const STATUS_TOKENS = new Set(["status", "state"]);
const HELP_TOKENS = new Set(["help", "--help", "-h"]);

function tokenizeArgs(args: string): string[] {
  return args
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function parseStickyInputCommandArgs(args: string): StickyInputCommandAction {
  const tokens = tokenizeArgs(args);

  if (tokens.length === 0 || (tokens.length === 1 && (tokens[0] === "mouse" || tokens[0] === "toggle"))) {
    return { type: "toggle" };
  }

  const normalizedTokens = tokens[0] === "mouse" ? tokens.slice(1) : tokens;
  if (normalizedTokens.length !== 1) {
    return {
      type: "error",
      message: "Usage: /sticky-scroll [on|off|toggle|status] or /sticky-scroll mouse [on|off|status].",
    };
  }

  const [token] = normalizedTokens;
  if (token === "toggle") {
    return { type: "toggle" };
  }

  if (HELP_TOKENS.has(token)) {
    return { type: "help" };
  }

  if (STATUS_TOKENS.has(token)) {
    return { type: "status" };
  }

  if (ENABLE_TOKENS.has(token)) {
    return { type: "setMouseScroll", enabled: true };
  }

  if (DISABLE_TOKENS.has(token)) {
    return { type: "setMouseScroll", enabled: false };
  }

  return {
    type: "error",
    message: `Unknown sticky-scroll command argument '${token}'. Use /sticky-scroll help.`,
  };
}

export function applyStickyMouseScrollMode(config: StickyMouseScrollConfig, enabled: boolean): void {
  // Terminal-mode activation already suppresses alternate-scroll while SGR mouse
  // capture is active. Preserve the user's configured alternate-scroll mode so
  // `/sticky-scroll off` restores it immediately.
  config.mouseScroll = enabled;
}

export function getStickyMouseScrollStatusMessage(enabled: boolean): string {
  return enabled
    ? "sticky-scroll SGR mouse-wheel capture is ON. Native terminal selection/link clicks are captured while this is on. Run /sticky-scroll off to restore native terminal mouse behavior."
    : "sticky-scroll SGR mouse-wheel capture is OFF. Native terminal selection/link clicks are preserved. Alternate-scroll remains available when enabled in config.";
}

export function getStickyInputCommandHelp(): string {
  return [
    "sticky-scroll mouse mode command:",
    "  /sticky-scroll          Toggle mouse-wheel chat scrolling",
    "  /sticky-scroll on       Enable mouse-wheel chat scrolling",
    "  /sticky-scroll off      Restore native terminal selection/link clicks",
    "  /sticky-scroll status   Show current mode",
  ].join("\n");
}
