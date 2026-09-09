---
name: linear
description: Create Linear issues for the olerhealth workspace and OLE team. Use when asked to file a bug, open a Linear issue, or turn investigation findings into a ticket. Also supports team verification and title searches for duplicates.
---

# Linear issues

## Setup and security

- Requires Node.js 22+ and an exported `LINEAR_API_KEY` with Read + Create issues permissions, restricted to OLE.
- The user stores the key in `~/.zshrc.local`, loaded by interactive zsh. Never read that file, print the key, dump the environment, or enable shell tracing.
- The helper reads the key directly from its environment and sends it only to `https://api.linear.app/graphql`.
- If Pi has not inherited the key, invoke the helper with `zsh -ic` as below. Do not extract the key into tool arguments or model context.
- Default and only supported destination: workspace `olerhealth`, team `OLE`. The helper verifies both before creating. No default project, assignee, label, or explicit status is configured; Linear chooses its default status.

## Workflow

1. Only create issues when the user requests or explicitly authorizes filing. Otherwise draft and ask first.
2. Identify a clear title and useful Markdown description from the actual task. Do not invent findings. Include relevant reproduction steps, expected/actual behavior, evidence, and acceptance criteria when known. Exclude secrets and unnecessary patient/personal data.
3. Search a few distinctive title keywords for possible duplicates. Search is substring-based, limited to 25 matches, and not exhaustive. If an apparent duplicate exists, show it and ask whether to create another.
4. Submit JSON on stdin with `title` and optional `description`. No other fields are currently supported. Do not guess project/status IDs or silently ignore requested metadata: explain the limitation first.
5. Return the created issue identifier and URL. Never claim creation succeeded without a confirmed API result.
6. Never automatically retry a creation after an error or timeout: it may have succeeded. Search/check Linear first; ask if uncertain.

## Commands

Resolve `scripts/linear.mjs` relative to this skill directory. The installed global path is used below. Arguments supplied by users must be safely shell-quoted; issue content belongs in stdin, not executable shell text.

Verify workspace/team (read-only):

```bash
zsh -ic 'node ~/.pi/agent/skills/linear/scripts/linear.mjs team'
```

Search titles (read-only):

```bash
zsh -ic 'node ~/.pi/agent/skills/linear/scripts/linear.mjs search "login timeout"'
```

Create an issue (writes to Linear; only after authorization):

```bash
zsh -ic 'node ~/.pi/agent/skills/linear/scripts/linear.mjs create' <<'LINEAR_ISSUE_JSON'
{
  "title": "Login times out after submitting credentials",
  "description": "## Summary\nDescribe the observed problem.\n\n## Acceptance criteria\n- Describe the expected fix."
}
LINEAR_ISSUE_JSON
```

Use a quoted heredoc delimiter absent from the payload, or a safely generated JSON file redirected to stdin. If the environment already contains the key, `node <skill-dir>/scripts/linear.mjs ...` works directly without zsh.

## References

- API/authentication and issue creation: https://linear.app/developers/graphql
- API-key permissions: https://linear.app/docs/api-and-webhooks
- Team: https://linear.app/olerhealth/team/OLE/overview
