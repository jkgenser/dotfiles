---
description: Dynamic worker implements, reviewer reviews, dynamic worker applies feedback
---
Use the subagent tool sequentially so you can dynamically choose the right worker reasoning level. Do NOT use one static chain for the worker steps.

Worker selection guide:
- `worker-medium`: straightforward, bounded changes; localized bug fixes/features/tests; low ambiguity.
- `worker-high`: nontrivial multi-file changes, refactors, integrations, API/data-flow changes, or moderate ambiguity.
- `worker-xhigh`: architecture-level work, broad/risky refactors, migrations, security/concurrency-sensitive code, hard debugging, or high ambiguity.
If uncertain, choose the higher reasoning level.

Workflow:

1. Choose the initial worker for: $@
2. Use that worker agent to implement the task. Include a one-line reason for the worker choice.
3. Use the `reviewer` agent to review the implementation from the worker output.
4. Choose a worker for applying review feedback:
   - Use `worker-medium` for small, mechanical fixes.
   - Use `worker-high` for nontrivial fixes or multiple warnings.
   - Use `worker-xhigh` for critical, risky, security-sensitive, architectural, or ambiguous feedback.
5. Use the chosen worker to apply the review feedback. Include the original request, worker output, reviewer output, and a one-line reason for the second worker choice.

Return both selected workers, review summary, and final implementation summary.
