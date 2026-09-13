import { homedir } from "node:os"
import { join } from "node:path"
import { getAgentDir, ProjectTrustStore, type ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { decideRepositoryTrust } from "./policy.ts"

// Explicit local repository identities, not names, remotes, globs, or branches.
// Adding an entry authorizes project resources on ALL of its linked worktrees.
const TRUSTED_COMMON_DIRS = [join(homedir(), "oler", ".git")]

export default function repositoryTrust(pi: ExtensionAPI): void {
  const trustStore = new ProjectTrustStore(getAgentDir())
  pi.on("project_trust", (event) => decideRepositoryTrust(
    event.cwd,
    TRUSTED_COMMON_DIRS,
    (cwd) => trustStore.get(cwd),
  ))
}
