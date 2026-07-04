---
description: Full implementation workflow with dynamic worker effort dispatch
---
Use the subagent tool sequentially so you can choose the right worker effort after seeing the scout/planner outputs. Do NOT use one static chain for the worker step.

Workflow:

1. Use the `scout` agent to find all code relevant to: $@
2. Use the `planner` agent to create an implementation plan for `$@` using the scout output.
3. Choose exactly one worker effort based on task complexity and the planner output:
   - `medium`: straightforward, bounded changes; localized bug fixes/features/tests; low ambiguity.
   - `high`: nontrivial multi-file changes, refactors, integrations, API/data-flow changes, or moderate ambiguity.
   - `xhigh`: architecture-level work, broad/risky refactors, migrations, security/concurrency-sensitive code, hard debugging, or high ambiguity.
   If uncertain, choose the higher reasoning level.
4. Use the subagent tool with `agent: "worker"` and the chosen `effort` to implement the plan. Include the original request, scout output, planner output, and a one-line reason for the effort choice in the task you send.

Return the selected worker effort and its final summary.
