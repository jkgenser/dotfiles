---
description: Dynamic worker implements, reviewer reviews, dynamic worker applies feedback
---
Use the subagent tool sequentially so you can dynamically choose the right worker effort. Do NOT use one static chain for the worker steps.

Worker effort selection guide:
- `medium`: straightforward, bounded changes; localized bug fixes/features/tests; low ambiguity.
- `high`: nontrivial multi-file changes, refactors, integrations, API/data-flow changes, or moderate ambiguity.
- `xhigh`: architecture-level work, broad/risky refactors, migrations, security/concurrency-sensitive code, hard debugging, or high ambiguity.
If uncertain, choose the higher reasoning level.

Workflow:

1. Choose the initial worker effort for: $@
2. Use the subagent tool with `agent: "worker"` and the chosen `effort` to implement the task. Include a one-line reason for the effort choice.
3. Use the `reviewer` agent to review the implementation from the worker output.
4. Choose a worker effort for applying review feedback:
   - Use `medium` for small, mechanical fixes.
   - Use `high` for nontrivial fixes or multiple warnings.
   - Use `xhigh` for critical, risky, security-sensitive, architectural, or ambiguous feedback.
5. Use the subagent tool with `agent: "worker"` and the chosen `effort` to apply the review feedback. Include the original request, worker output, reviewer output, and a one-line reason for the second effort choice.

Return both selected worker efforts, review summary, and final implementation summary.
