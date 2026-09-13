# Repository trust

Global Pi extension: automatically trust the main `~/oler` checkout and all of
its registered linked worktrees, on any branch and at any filesystem location.
This avoids per-worktree approvals for Paseo without trusting every Paseo repo.

## Policy

`TRUSTED_COMMON_DIRS` in `index.ts` is the explicit allowlist. It currently
contains only `~/oler/.git` (resolved using the current user's home directory).
To add a repository, review and add its local Git common-directory path there.
No matching by repository name, Git remote, branch name, or wildcard occurs.
A separate Oler clone is **not** automatically trusted.

The extension handles Pi's `project_trust` event before project resources load:

1. Defer to any saved trust decision from Pi's active agent directory, including
   a parent-folder denial. Pi's command-line `--approve`/`--no-approve` overrides
   take precedence before this event is emitted.
2. Resolve the checkout's Git common directory and compare canonical filesystem
   paths against the allowlist. Ignore inherited `GIT_*` overrides.
3. Require cwd to be within a checkout registered by `git worktree list` in that
   repository. A copied `.git` pointer alone does not qualify.
4. Return session/process-only approval on a match, otherwise `undecided` so
   Pi's normal trust policy continues. Git failures and missing allowlist paths
   never cause automatic approval. No trust entries are saved.

The checks use bounded, local Git metadata commands; no shell, Git hooks,
network access, package installation, or repository writes are performed by
this extension. It works without a UI wherever Pi emits `project_trust`.
An earlier extension's yes/no decision takes precedence under Pi's event rules.

**This is not a sandbox or proof of code provenance.** Approval permits Pi to
load project settings, skills, and executable extensions and install configured
project packages. Every branch in the allowed repository is covered, including
unreviewed branch code. Local Git metadata and the allowlisted directory must
remain under your control. Replacing `~/oler` with another repository at the
same path also changes which repository this policy trusts. Nested independent
repositories and submodules do not inherit Oler's repository identity.

## Review and activation

Changes in chezmoi source are inert until applied. Review the diff first:

```sh
chezmoi diff --recursive ~/.pi/agent/extensions/repository-trust
# After review, apply only this extension:
chezmoi apply --recursive ~/.pi/agent/extensions/repository-trust
```

Restart Pi/Paseo agents afterward; an already-resolved trust decision is not
changed by merely reloading the extension. The harness must use the same Pi
agent directory where chezmoi installed this global extension, and must load
global extensions and invoke Pi's trust flow. This does not repair a harness
that bypasses resource discovery or disables extensions/skills.

Verify in a fresh Oler worktree that project skills appear (for example,
`/skill:oler-frontend` in Pi's command completion). If they do not, check for a
saved denial, a different agent directory, disabled resources, or a harness
that does not invoke the trust hook. To disable automatic approval, remove the
allowlist entry or this extension and restart; existing manual trust decisions
remain untouched.

## Tests

From the chezmoi source root, using Node 22.18+ and Git:

```sh
node --experimental-strip-types --test dot_pi/agent/extensions/repository-trust/test/*.test.ts
```

Tests create and remove temporary local Git repositories only. No live trust
settings, dotfiles, Oler data, external services, or model requests are used.
