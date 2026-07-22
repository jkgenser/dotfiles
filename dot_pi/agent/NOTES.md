# Pi Notes

## Todos

- Pi equivalent of OpenCode's plan mode is installed from Pi's shipped `examples/extensions/plan-mode` into `extensions/plan-mode`, alongside `extensions/questionnaire.ts`. Use `/plan` or Ctrl+Alt+P to enter read-only planning, then execute tracked plan steps.
- Figure out whether Pi needs an LSP/diagnostics replacement, or whether project test/typecheck commands are enough.
- Verify the exact Pi model selector for Google Vertex Claude Opus.
- Subagents are installed from Pi's shipped `examples/extensions/subagent` into `extensions/subagent`, with user agents in `agents/` and workflows in `prompts/`. The active roster is intentionally small: `scout` uses the direct `deepseek` API provider with `deepseek-v4-pro:high`, `worker-lite` uses direct `deepseek/deepseek-v4-pro:max`, and `worker` uses `openai-codex/gpt-5.6-terra` with per-invocation `effort=medium/high/xhigh/max` (default `max`). Retired agents and the old prompt-only effort profiles live under `archive/agents/` and are not discovered. Planning and review are handled by the main agent.
- Pi/OpenAI Codex Fast Mode is implemented in `extensions/service-tier-priority.ts`: use `/fast [on|off|toggle]` to add `service_tier: "priority"` to real GPT-5.4, GPT-5.5, and GPT-5.6 family requests without fake priority model aliases.
- Doubled Enter/Tab/Backspace input in Pi was caused by Alacritty 0.13.2's Kitty keyboard handling. `keybytes --pi-query` showed plain duplicate bytes: Enter `0x0d 0x0d`, Backspace `0x7f 0x7f`, Tab `0x09 0x09`. Updating Alacritty to 0.17.0 fixed the raw input, so the old `PI_TUI_KITTY_KEYBOARD_FLAGS=0` shell workaround and `extensions/alacritty-key-dedupe.ts` were removed.
