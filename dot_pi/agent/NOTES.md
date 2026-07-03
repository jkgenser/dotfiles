# Pi Notes

## Todos

- Figure out the Pi equivalent of OpenCode's plan mode. Start by trying read-only tool allowlists such as `pi --tools read,grep,find,ls`, then decide whether a prompt template or extension is worth adding.
- Figure out whether Pi needs an LSP/diagnostics replacement, or whether project test/typecheck commands are enough.
- Verify the exact Pi model selector for Google Vertex Claude Opus.
- Figure out the Pi/OpenAI Codex equivalent of OpenCode's `fast` GPT-5.5 path. Current setup adds an `openai-codex/gpt-5.5-priority` alias via `models.json`; `extensions/service-tier-priority.ts` rewrites requests to `gpt-5.5` with `service_tier: "priority"`.
- Doubled Enter/Tab/Backspace input in Pi was caused by Alacritty 0.13.2's Kitty keyboard handling. `keybytes --pi-query` showed plain duplicate bytes: Enter `0x0d 0x0d`, Backspace `0x7f 0x7f`, Tab `0x09 0x09`. Updating Alacritty to 0.17.0 fixed the raw input, so the old `PI_TUI_KITTY_KEYBOARD_FLAGS=0` shell workaround and `extensions/alacritty-key-dedupe.ts` were removed.
