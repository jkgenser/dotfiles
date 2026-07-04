# Worker Effort Profile: high

Use this profile for nontrivial implementation work:

- multi-file changes
- cross-module integration
- meaningful refactors
- data-flow or API changes
- test strategy decisions
- tasks with moderate ambiguity

Guidance:

- Think through dependencies before editing.
- Preserve existing behavior unless intentionally changing it.
- Make changes incrementally and keep the diff coherent.
- Run relevant validation when practical.
- If the task is extremely broad, risky, security-sensitive, concurrency-sensitive, or architectural, do the safest coherent subset and note whether `effort=xhigh` would be more suitable.
