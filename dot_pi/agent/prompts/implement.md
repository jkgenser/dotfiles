---
description: Full implementation workflow with dynamic worker tier and effort dispatch
---
Use the subagent tool sequentially so you can choose the right implementation agent and reasoning effort after seeing the scout/planner outputs. Do NOT use one static chain for the implementation step.

Workflow:

1. Use the `scout` agent to find all code relevant to: $@
2. Use the `planner` agent to create an implementation plan for `$@` using the scout output.
3. Choose exactly one implementation agent based on task demands:
   - `worker-lite` (GPT-5.6 Terra): prefer for straightforward, bounded, low-risk work such as localized fixes, small features, tests, documentation, and mechanical edits.
   - `worker` (GPT-5.6 Sol): use for complex or broad changes, cross-module integration, difficult debugging, architectural work, security/concurrency-sensitive code, or substantial ambiguity.
   If uncertain whether Terra can execute the task reliably, choose `worker`.
4. Independently choose exactly one reasoning effort:
   - `medium`: clear, bounded work with low ambiguity.
   - `high`: nontrivial changes, meaningful refactors, integration or API/data-flow work, or moderate ambiguity.
   - `xhigh`: architecture-level or risky work, migrations, security/concurrency concerns, hard debugging, or high ambiguity.
   A bounded but subtle task may use `worker-lite:high` or `worker-lite:xhigh`; model tier and reasoning effort are separate decisions. If uncertain about effort, choose the higher level.
5. Use the subagent tool with the selected `agent` and `effort` to implement the plan. Include the original request, scout output, planner output, and one-line reasons for both choices in the task you send.

Return the selected implementation agent, reasoning effort, and final summary.
