#!/usr/bin/env bash
# Run sticky-scroll's regression suite using Pi's already-installed runtime
# dependencies. No package installation or network access is required.
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

if [[ -n ${PI_CODING_AGENT_ROOT:-} ]]; then
  agent_root=$PI_CODING_AGENT_ROOT
elif [[ -n ${PI_CODING_AGENT_NODE_MODULES:-} ]]; then
  agent_root=$(cd -- "$PI_CODING_AGENT_NODE_MODULES/.." && pwd)
else
  pi_cli=${PI_CLI_PATH:-"$HOME/.local/share/pi-node/current/bin/pi"}
  if [[ ! -f $pi_cli ]]; then
    printf 'sticky-scroll tests: Pi CLI not found at %s; set PI_CODING_AGENT_ROOT or PI_CLI_PATH.\n' "$pi_cli" >&2
    exit 1
  fi
  agent_root=$(cd -- "$(dirname -- "$pi_cli")/../lib/node_modules/@earendil-works/pi-coding-agent" && pwd)
fi

core_modules=$(cd -- "$agent_root/../.." && pwd)
agent_modules=$agent_root/node_modules
if [[ ! -d $agent_modules/jiti || ! -d $core_modules/@earendil-works/pi-coding-agent ]]; then
  printf 'sticky-scroll tests: Pi runtime dependencies not found below %s.\n' "$agent_root" >&2
  exit 1
fi

NODE_PATH=$core_modules:$agent_modules${NODE_PATH:+:$NODE_PATH} node --test "$root"/test/*.test.cjs
