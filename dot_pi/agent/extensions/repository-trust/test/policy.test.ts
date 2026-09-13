import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { decideRepositoryTrust, gitEnvironment, isAllowedWorktree } from "../policy.ts"

const sandbox = mkdtempSync(join(tmpdir(), "pi-repository-trust-"))
after(() => rmSync(sandbox, { recursive: true, force: true }))

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-C", cwd, "-c", "core.hooksPath=/dev/null", ...args], {
    env: {
      ...gitEnvironment(),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Trust Test",
      GIT_AUTHOR_EMAIL: "trust-test@example.invalid",
      GIT_COMMITTER_NAME: "Trust Test",
      GIT_COMMITTER_EMAIL: "trust-test@example.invalid",
    },
    stdio: "pipe",
  })
}

const repo = join(sandbox, "oler")
mkdirSync(repo)
git(repo, "init")
git(repo, "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture")
const commonDir = join(repo, ".git")
const worktree = join(sandbox, "arbitrary paseo parent", "some worktree")
git(repo, "worktree", "add", "--detach", worktree)
const nested = join(worktree, "src", "nested")
mkdirSync(nested, { recursive: true })

const unlisted = join(sandbox, "unlisted")
mkdirSync(unlisted)
const clone = join(sandbox, "other-clone", "oler")
mkdirSync(join(sandbox, "other-clone"))
git(sandbox, "clone", "--no-hardlinks", repo, clone)

const decide = (cwd: string, saved: boolean | null = null) =>
  decideRepositoryTrust(cwd, [commonDir], () => saved)

test("trusts the main checkout and arbitrary linked worktrees without persistence", async () => {
  assert.deepEqual(await decide(repo), { trusted: "yes" })
  assert.deepEqual(await decide(worktree), { trusted: "yes" })
  assert.deepEqual(await decide(nested), { trusted: "yes" })
})

test("covers future worktrees and branches without adding path rules", async () => {
  const future = join(sandbox, "future-worktree")
  git(repo, "worktree", "add", "-b", "future-branch", future)
  assert.deepEqual(await decide(future), { trusted: "yes" })
})

test("canonicalizes symlink aliases for both cwd and the allowlist", async () => {
  const repoAlias = join(sandbox, "repo-alias")
  const worktreeAlias = join(sandbox, "worktree-alias")
  symlinkSync(repo, repoAlias, "dir")
  symlinkSync(worktree, worktreeAlias, "dir")
  assert.equal(await isAllowedWorktree(worktreeAlias, [join(repoAlias, ".git")]), true)
})

test("defers for separate clones, non-repositories, missing paths, and empty allowlists", async () => {
  for (const cwd of [clone, unlisted, join(sandbox, "missing")]) {
    assert.deepEqual(await decide(cwd), { trusted: "undecided" })
  }
  assert.equal(await isAllowedWorktree(repo, []), false)
  assert.equal(await isAllowedWorktree(repo, [join(sandbox, "missing", ".git")]), false)
  assert.equal(await isAllowedWorktree(repo, [join(sandbox, "missing"), commonDir]), true)
})

test("does not inherit the outer repository's trust in a nested repository", async () => {
  const inner = join(worktree, "inner-repo")
  mkdirSync(inner)
  git(inner, "init")
  assert.deepEqual(await decide(inner), { trusted: "undecided" })
})

test("does not trust an unregistered directory with a copied .git pointer", async () => {
  const forged = join(sandbox, "forged")
  mkdirSync(forged)
  copyFileSync(join(worktree, ".git"), join(forged, ".git"))
  assert.deepEqual(await decide(forged), { trusted: "undecided" })
})

test("defers to existing saved approvals and denials, including ancestor decisions", async () => {
  assert.deepEqual(await decide(worktree, false), { trusted: "undecided" })
  assert.deepEqual(await decide(worktree, true), { trusted: "undecided" })
  let checkedCwd: string | undefined
  const result = await decideRepositoryTrust(nested, [commonDir], (cwd) => {
    checkedCwd = cwd
    return false // ProjectTrustStore.get resolves the nearest ancestor decision.
  })
  assert.equal(checkedCwd, nested)
  assert.deepEqual(result, { trusted: "undecided" })
})

test("never auto-approves when the saved trust lookup fails", async () => {
  assert.deepEqual(await decideRepositoryTrust(repo, [commonDir], () => {
    throw new Error("unreadable trust store")
  }), { trusted: "undecided" })
})

test("strips inherited Git overrides while preserving ordinary process settings", () => {
  assert.deepEqual(gitEnvironment({
    PATH: "/usr/bin", HOME: "/test-home", GIT_DIR: commonDir,
    GIT_WORK_TREE: repo, GIT_COMMON_DIR: commonDir, GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: "*",
    GIT_CEILING_DIRECTORIES: sandbox,
  }), { PATH: "/usr/bin", HOME: "/test-home" })
})

test("inherited Git directory overrides cannot make an unrelated cwd trusted", async () => {
  const keys = ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"] as const
  const previous = keys.map((key) => process.env[key])
  try {
    process.env.GIT_DIR = commonDir
    process.env.GIT_COMMON_DIR = commonDir
    process.env.GIT_WORK_TREE = repo
    assert.deepEqual(await decide(unlisted), { trusted: "undecided" })
    assert.deepEqual(await decide(worktree), { trusted: "yes" })
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key]
      else process.env[key] = previous[i]
    })
  }
})

test("missing Git defers instead of granting trust or crashing startup", async () => {
  const previous = process.env.PATH
  try {
    process.env.PATH = unlisted
    assert.deepEqual(await decide(repo), { trusted: "undecided" })
  } finally {
    if (previous === undefined) delete process.env.PATH
    else process.env.PATH = previous
  }
})
