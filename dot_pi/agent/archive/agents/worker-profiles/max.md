# Worker Effort Profile: max

Use this profile when the selected implementation tier should apply its maximum available reasoning depth:

- deceptively small changes with subtle invariants
- difficult debugging with incomplete or conflicting evidence
- security, concurrency, migration, or data-integrity risks
- broad architectural interactions
- changes where silent regressions would be expensive

Guidance:

- Build and verify a detailed mental model before editing.
- Trace important callers, state transitions, failure paths, and compatibility constraints.
- Challenge initial assumptions and investigate contradictory evidence.
- Prefer the smallest complete and defensible change over speculative redesign.
- Validate the highest-risk behavior directly when practical, then run the narrowest relevant broader checks.
- Clearly document unresolved risks, unavailable validation, and any scope deliberately left for follow-up.
