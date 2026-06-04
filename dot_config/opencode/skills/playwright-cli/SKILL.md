---
name: playwright-cli
description: Use playwright-cli for browser automation, snapshots, screenshots, and session-based testing from OpenCode.
compatibility: opencode
---

## When to use

Use this skill when the task needs browser automation, visual verification, screenshots, DOM snapshots, login/session reuse, or lightweight end-to-end checks.

Prefer `playwright-cli` over Playwright MCP unless the task specifically needs MCP behavior.

## Setup assumptions

- `playwright-cli` is installed and available on `PATH`.
- Use named sessions for project-specific flows when helpful.
- Use `--headed` when the user wants to watch the browser.

## Workflow

1. Start or reuse a session.
2. Open the target page.
3. Capture a snapshot to get element refs.
4. Interact using refs from the latest snapshot.
5. Save screenshots, PDFs, traces, or video only when useful.
6. Close the session when the task is done unless the user wants it left open.

## Common commands

```bash
playwright-cli open https://example.com
playwright-cli open https://example.com --headed
playwright-cli -s=myapp open https://example.com
playwright-cli snapshot
playwright-cli click e12
playwright-cli fill e15 "hello"
playwright-cli press Enter
playwright-cli screenshot
playwright-cli console
playwright-cli network
playwright-cli close
```

## Session tips

- Use `playwright-cli -s=<name> ...` to isolate work by app or task.
- Reuse the same session for multi-step authenticated flows.
- Use `playwright-cli list` to inspect active sessions.

## Good defaults

- Start with `open`, then `snapshot`.
- Do not invent flags or combine unsupported subcommand options; for example, `playwright-cli open` does not support `--snapshot`.
- After actions that may change the page, take another `snapshot` before using new refs.
- Prefer concise command sequences over long exploratory loops.
- Use `screenshot` when the result should be preserved or shown.

## Example prompt behavior

For a request like "test the login flow", use commands like:

```bash
playwright-cli -s=login open https://app.example.com/login --headed
playwright-cli -s=login snapshot
playwright-cli -s=login fill e12 "user@example.com"
playwright-cli -s=login fill e15 "password"
playwright-cli -s=login click e18
playwright-cli -s=login snapshot
playwright-cli -s=login screenshot
```
