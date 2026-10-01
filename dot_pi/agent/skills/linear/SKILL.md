---
name: linear
description: Create Linear issues for the olerhealth workspace and OLE team, optionally in a verified project. Use when asked to file a bug, open a Linear issue, or turn investigation findings into a ticket. Also supports team/project verification and title searches for duplicates.
---

# Linear issues

## Setup and security

- Requires Node.js 22+ and an exported `LINEAR_API_KEY` with Read + Create issues permissions, restricted to OLE.
- The user stores the key in `~/.zshrc.local`, loaded by interactive zsh. Never read that file, print the key, dump the environment, or enable shell tracing.
- The helper reads the key directly from its environment and sends it only to `https://api.linear.app/graphql`.
- If Pi has not inherited the key, invoke the helper with `zsh -ic` as below. Do not extract the key into tool arguments or model context.
- Default and only supported destination: workspace `olerhealth`, team `OLE`. The helper verifies both before creating. An optional `projectUrl` assigns the issue to a verified OLE project during creation. No default project, assignee, label, or explicit status is configured; Linear chooses its default status.

## Workflow

1. Only create issues when the user requests or explicitly authorizes filing. Otherwise draft and ask first.
2. Identify a clear title and useful Markdown description from the actual task. Do not invent findings. Include relevant reproduction steps, expected/actual behavior, evidence, and acceptance criteria when known. Exclude secrets and unnecessary patient/personal data.
3. Search a few distinctive title keywords for possible duplicates. Search is substring-based, limited to 25 matches, and not exhaustive. If an apparent duplicate exists, show it and ask whether to create another.
4. Submit JSON on stdin with `title`, optional `description`, and optional `projectUrl`. When the user supplies a project URL, include it: do not silently omit project assignment. The helper resolves the URL's slug to a project UUID, verifies workspace and OLE membership, and includes `projectId` in the creation mutation. It confirms the returned assignment. Do not guess IDs. Assignee, labels, priority, and explicit status are not supported; explain that limitation before creation if requested.
5. If the issue tracks work implemented in an existing GitHub PR, associate it after creation by adding the confirmed issue identifier to the PR title (for example, `OLE-123 Existing PR title`). First inspect the PR with `gh pr view --json number,title,url`; preserve the existing title verbatim, do not add the identifier twice, and update only that PR with `gh pr edit <number-or-url> --title <new-title>`. Treat this as part of an explicitly requested issue-filing workflow, but state that the GitHub integration must be enabled for Linear to create the link. If `gh` cannot identify the implementation PR unambiguously, ask instead of guessing. Do not use a closing keyword merely to associate it. For a deferred bug discovered while reviewing another PR, link that source PR in the issue description instead of renaming it or implying it implements the fix.
6. Return the created issue identifier and URL, its confirmed project when requested, plus the updated PR URL when applicable. Never claim creation or association succeeded without confirmed command results.
7. Never automatically retry a creation after an error or timeout: it may have succeeded. Search/check Linear first; ask if uncertain.

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

Verify a requested project (read-only; accepts its canonical URL or `/overview` URL):

```bash
zsh -ic 'node ~/.pi/agent/skills/linear/scripts/linear.mjs project "https://linear.app/olerhealth/project/completion-mvp-5aeca2ae89c2/overview"'
```

The final 12-character suffix is a project **slug ID**, not its UUID. Linear's
`project(id: <slug ID>)` query resolves it to `id`, `name`, `url`, and `teams`.
The helper verifies the returned slug, workspace URL, and OLE team before using
that UUID as `IssueCreateInput.projectId`. This does not make Completion MVP a
default project. If only a project name is supplied, resolve it read-only via
`projects(filter: { name: { eq: <name> } })`, inspect the returned URL/team, and
ask if multiple projects match rather than guessing.

Create an issue (writes to Linear; only after authorization):

```bash
zsh -ic 'node ~/.pi/agent/skills/linear/scripts/linear.mjs create' <<'LINEAR_ISSUE_JSON'
{
  "title": "Login times out after submitting credentials",
  "description": "## Summary\nDescribe the observed problem.\n\n## Acceptance criteria\n- Describe the expected fix.",
  "projectUrl": "https://linear.app/olerhealth/project/completion-mvp-5aeca2ae89c2/overview"
}
LINEAR_ISSUE_JSON
```

Omit `projectUrl` when no project was requested. Use a quoted heredoc delimiter absent from the payload, or a safely generated JSON file redirected to stdin. If the environment already contains the key, `node <skill-dir>/scripts/linear.mjs ...` works directly without zsh.

If creation succeeds but project confirmation fails, the helper reports the
created identifier/URL. Inspect that existing issue; never create a replacement.
Repairing an existing issue's project uses
`issueUpdate(id: <issue UUID>, input: { projectId: <verified project UUID> })`
and requires update permissions. Confirm `success` and the returned
`issue.project` before claiming assignment. Do not silently fall back to creating
an unassigned issue after a project lookup failure.

## Local validation

```bash
node --test scripts/linear.test.mjs
```

These tests use fake API responses and need no credentials or live writes.

## References

- API/authentication and issue creation: https://linear.app/developers/graphql
- API-key permissions: https://linear.app/docs/api-and-webhooks
- Team: https://linear.app/olerhealth/team/OLE/overview
