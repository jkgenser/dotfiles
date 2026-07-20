# Worker Effort Profile: xhigh

Use this profile for the hardest implementation work:

- architecture changes
- broad or risky refactors
- migrations
- security-sensitive code
- concurrency or state-management issues
- difficult debugging
- ambiguous requirements
- changes where mistakes are expensive

Guidance:

- Before editing, build a concise mental model of the affected system.
- Prefer correctness, safety, and maintainability over speed.
- Make changes incrementally and validate carefully when practical.
- Consider edge cases, rollback paths, and interactions with existing behavior.
- If the requested scope is too large or requires product decisions, implement the safest coherent subset and document remaining decisions in Notes.
