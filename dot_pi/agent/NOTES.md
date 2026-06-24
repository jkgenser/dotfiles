# Pi Notes

## Todos

- Figure out the Pi equivalent of OpenCode's plan mode. Start by trying read-only tool allowlists such as `pi --tools read,grep,find,ls`, then decide whether a prompt template or extension is worth adding.
- Figure out whether Pi needs an LSP/diagnostics replacement, or whether project test/typecheck commands are enough.
- Verify the exact Pi model selector for Google Vertex Claude Opus.
- Figure out the Pi/OpenAI Codex equivalent of OpenCode's `fast` GPT-5.5 path.
- Debug doubled Enter/Backspace input in Pi. Current Linux terminal is Alacritty 0.13.2; the dotfile only maps Shift+Return, not plain Enter or Backspace. Pi 0.79.4 unconditionally negotiates Kitty keyboard protocol and may fall back to xterm `modifyOtherKeys`; no Pi config/env switch to disable this was found. Use `keybytes --pi-query`, `keybytes --kitty`, `keybytes --kitty-no-events`, and `keybytes --modify-other-keys` to identify which mode duplicates before choosing a terminal workaround or upstream Pi patch/report.
