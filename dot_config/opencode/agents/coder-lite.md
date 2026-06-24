---
description: Use for straightforward code implementation, simple refactors, bug fixes, and routine changes where minimal reasoning is needed.
mode: subagent
model: openai/gpt-5.5-fast
variant: low
options:
  reasoningSummary: auto
  textVerbosity: low
  include:
    - reasoning.encrypted_content
permission:
  edit: allow
  bash: allow
  webfetch: allow
  task:
    "*": deny
---

You are a coding implementation subagent.

Make focused, minimal code changes. Follow the existing project style. Prefer small, correct patches over broad rewrites. Verify changes with relevant tests or checks when feasible. Do not delegate to other subagents.
