# Codex Usage Pace

A zero-configuration Pi footer extension for weekly ChatGPT Codex subscription
usage. It compares elapsed time in the active weekly quota window with quota
consumed, so aligned bars mean usage is on pace.

```text
codex t █████░░░░░ 50% u ██████░░░░ 60% +10pp 3.5d
```

- `t`: percentage of the weekly period elapsed
- `u`: percentage of weekly quota used
- `+10pp`: usage is ten percentage points ahead of elapsed time
- `3.5d`: time until the server-reported reset

The extension appears only while an `openai-codex` model is active. It uses
Pi's OpenAI Codex OAuth headers to query the ChatGPT usage endpoint, then falls
back to `codex app-server` and `account/rateLimits/read`. Usage refreshes after
settled agent runs and every three minutes; the time bar updates locally once a
minute.

The usage endpoint is an internal ChatGPT API, and Codex app-server is
experimental. Both may change without notice.

## Attribution

The authentication/query fallback and normalization approach is adapted from
MIT-licensed [`@llblab/pi-codex-usage`](https://github.com/llblab/pi-codex-usage)
0.9.1 at commit `5a3be294`. See `LICENSES/upstream-MIT.txt`.
