---
description: Dynamic implementation tier and effort, review, then dynamic feedback dispatch
---
Use the subagent tool sequentially so you can dynamically choose the implementation agent and reasoning effort for each implementation step. Do NOT use one static chain for these steps.

Implementation agent guide:
- `worker-lite` (GPT-5.6 Terra): prefer for straightforward, bounded, low-risk tasks and mechanical review fixes.
- `worker` (GPT-5.6 Sol): use for complex, broad, ambiguous, architectural, security-sensitive, concurrency-sensitive, or difficult work.
If uncertain whether Terra can execute a step reliably, choose `worker`.

Reasoning effort guide (choose independently of agent):
- `medium`: clear, bounded changes with low ambiguity.
- `high`: nontrivial changes, refactors, integrations, API/data-flow work, or moderate ambiguity.
- `xhigh`: architecture-level or risky work, migrations, security/concurrency concerns, hard debugging, or high ambiguity.
A bounded but subtle task may use `worker-lite:high` or `worker-lite:xhigh`. If uncertain about effort, choose the higher level.

Workflow:

1. Choose the initial implementation agent and reasoning effort for: $@
2. Use the subagent tool with the selected `agent` and `effort` to implement the task. Include one-line reasons for both choices.
3. Use the `reviewer` agent to review the implementation output.
4. Reassess both dimensions for applying review feedback. Prefer `worker-lite:medium` for small mechanical fixes; increase the effort and/or use `worker` as complexity, risk, or ambiguity rises.
5. Use the subagent tool with the newly selected `agent` and `effort` to apply the feedback. Include the original request, initial implementation output, reviewer output, and one-line reasons for both new choices.

Return both selected agent/effort pairs, the review summary, and the final implementation summary.
