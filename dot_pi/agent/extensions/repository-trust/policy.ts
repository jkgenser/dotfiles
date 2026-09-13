import { execFile } from "node:child_process"
import { realpath } from "node:fs/promises"
import { isAbsolute, relative, sep } from "node:path"
import { promisify } from "node:util"
import type { ProjectTrustEventResult } from "@earendil-works/pi-coding-agent"

const execFileAsync = promisify(execFile)

// Git discovery must describe cwd, not an inherited GIT_DIR/GIT_WORK_TREE or
// injected configuration. Do not execute a shell, hooks, or network operations.
export function gitEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_")))
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    env: gitEnvironment(),
    encoding: "utf8",
    timeout: 3000,
    maxBuffer: 1024 * 1024,
  })
  return stdout
}

async function gitPath(cwd: string, flag: string): Promise<string> {
  const output = await git(cwd, ["rev-parse", "--path-format=absolute", flag])
  // Reject ambiguous line-oriented output instead of guessing at unusual paths.
  const path = output.replace(/\n$/, "")
  if (!path || /[\r\n\0]/.test(path)) throw new Error("Ambiguous Git path")
  return realpath(path)
}

export async function isAllowedWorktree(cwd: string, commonDirs: readonly string[]): Promise<boolean> {
  try {
    const commonDir = await gitPath(cwd, "--git-common-dir")
    const allowed = await Promise.all(commonDirs.map(async (path) => {
      try {
        return await realpath(path)
      } catch {
        return undefined
      }
    }))
    if (!allowed.includes(commonDir)) return false

    const root = await gitPath(cwd, "--show-toplevel")
    const withinRoot = relative(root, await realpath(cwd))
    if (isAbsolute(withinRoot) || withinRoot === ".." || withinRoot.startsWith(`..${sep}`)) return false
    const listing = await git(cwd, ["worktree", "list", "--porcelain", "-z"])
    // A copied/forged .git pointer alone is not enough: the trusted repository
    // must also register this checkout. NUL records handle spaces and quoting.
    for (const field of listing.split("\0")) {
      if (!field.startsWith("worktree ")) continue
      try {
        if (await realpath(field.slice("worktree ".length)) === root) return true
      } catch {
        // A stale registration for another worktree must not grant trust.
      }
    }
    return false
  } catch {
    // Missing Git, non-repositories, timeouts, and malformed metadata defer to Pi.
    return false
  }
}

export async function decideRepositoryTrust(
  cwd: string,
  commonDirs: readonly string[],
  getSavedDecision: (cwd: string) => boolean | null,
): Promise<ProjectTrustEventResult> {
  try {
    // Extensions run BEFORE Pi's saved-decision lookup. Explicitly defer so a
    // saved denial (including a parent denial) is never silently overridden.
    if (getSavedDecision(cwd) !== null) return { trusted: "undecided" }
    if (await isAllowedWorktree(cwd, commonDirs)) return { trusted: "yes" }
  } catch {
    // An unreadable trust store must not turn into automatic approval.
  }
  return { trusted: "undecided" }
}
