# Supervised Worker

A local, dependency-free Pi extension for one fast implementation worker supervised by the smart parent session.

## Contract

- Worker model: `deepseek/deepseek-v4-flash:max`
- One writer at a time
- Separate persistent Pi RPC process and context
- Project context files are retained
- Ambient child extensions, skills, prompts, and themes are disabled
- Child tools: `read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`, `contact_supervisor`
- Maximum four blocking supervisor questions per run
- Supervisor replies are always arbitrary free text; suggested choices are advisory
- Progress updates do not wake the parent model
- Blocking decisions and completion wake the parent model

## Parent tools

```text
supervised_worker({ task, cwd? })
worker_supervisor({ action: "status", id? })
worker_supervisor({ action: "reply", replyTo, message })
worker_supervisor({ action: "stop", id? })
```

Give `supervised_worker` a complete brief with approved decisions, constraints, and validation expectations. The child should use `contact_supervisor` only when a consequential unapproved decision blocks safe progress.

## Sessions and attachment

Every worker gets a private persistent session under:

```text
~/.pi/agent/sessions/supervised-workers/<parent-session-id>/<run-id>.jsonl
```

The live RPC child's stdin and stdout are owned by this extension. Do not open the same session concurrently. Once the worker completes or is stopped, status and completion messages show the command:

```sh
pi --session "/path/to/worker-session.jsonl"
```

That opens the child conversation for inspection or continuation. True live TUI detach/reattach would require a separate transport and process-ownership protocol and is intentionally outside this minimal implementation.

## Design

The same `index.ts` runs in two modes. The parent mode manages the RPC process. A child environment marker makes it register only `contact_supervisor`.

A blocking child request uses Pi's documented RPC extension-UI protocol. The child emits an `extension_ui_request`; the parent injects the question into the smart session; `worker_supervisor` sends the matching `extension_ui_response`. No shared request/reply files or third-party packages are used.

## Validation

Run the dependency-free protocol tests with:

```sh
node --experimental-strip-types --test \
  ~/.local/share/chezmoi/dot_pi/agent/extensions/supervised-worker/test/protocol.test.ts
```
