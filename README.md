# dotfiles

Personal dotfiles managed with [chezmoi](https://www.chezmoi.io/).

This repo supports macOS, Linux desktop machines, and a minimal `paseo`
profile for the persistent home directory in a headless Paseo development
container.

## macOS Bootstrap

Install chezmoi, apply the dotfiles, then install packages from the Brewfile:

```sh
brew install chezmoi
chezmoi init --apply jkgenser/dotfiles
brew bundle --file ~/.local/share/chezmoi/Brewfile
curl -fsSL https://pi.dev/install.sh | sh
```

The Brewfile installs the Tailscale app. Open Tailscale after installation and
sign in.

If SSH is preferred and GitHub SSH keys are already set up, use:

```sh
chezmoi init --ssh --apply jkgenser/dotfiles
```

## Linux Desktop Bootstrap

Install baseline packages first. On Ubuntu/Debian-like systems:

```sh
sudo apt-get update
sudo apt-get install -y git git-delta git-lfs curl wget unzip build-essential zsh ripgrep fd-find jq htop tree ca-certificates gnupg lsb-release alacritty i3 sway waybar wofi rofi polybar xdg-desktop-portal-wlr x11-xserver-utils xinput xss-lock i3lock network-manager-gnome pulseaudio-utils fontconfig
```

Install Glow from Charm's official APT repository:

```sh
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list
sudo apt-get update
sudo apt-get install -y glow
```

Glow is a system package, so it is intentionally installed during the Linux
bootstrap rather than by a chezmoi `run_once` script. This keeps `chezmoi
apply` from unexpectedly requesting `sudo` or changing APT sources. Verify the
install with `glow --version`.

Install chezmoi, then initialize and apply this repo:

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
chezmoi init --apply jkgenser/dotfiles
```

Install optional developer tools as needed:

```sh
curl -sS https://starship.rs/install.sh | sh
curl -LsSf https://astral.sh/uv/install.sh | sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"
cargo install lumen
curl -fsSL https://pi.dev/install.sh | sh
curl -fsSL https://opencode.ai/install | bash
```

The shell config adds `~/.local/bin`, `~/.cargo/bin`, `~/.pi/bin`, and Pi's
managed Node path when present, so locally installed tools are visible on Linux
and macOS.

## Paseo / Headless Profile

The `paseo` profile applies shared Git identity and credential-helper settings
plus headless-compatible Pi configuration. It excludes desktop configuration,
GUI helper scripts, zsh configuration, Git integrations whose binaries are not
installed in the container, and the Pi Vertex and desktop-notification
extensions.

Create the machine-local profile data before initializing chezmoi:

```sh
mkdir -p ~/.config/chezmoi ~/.local/bin
cat > ~/.config/chezmoi/chezmoi.toml <<'EOF'
[data]
profile = "paseo"
EOF

sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
chezmoi init jkgenser/dotfiles
chezmoi diff
chezmoi apply
```

The profile selects Pi's light theme, OpenAI Codex `gpt-5.6-sol`, and high
thinking by default. It also adds `~/.local/bin` to login-shell `PATH`. Pi
provider authentication, GitHub authentication, sessions, trust decisions,
and generated state remain machine-local and are not managed by this
repository.

Review later updates before applying executable Pi extensions:

```sh
chezmoi git pull -- --ff-only
chezmoi diff
chezmoi apply
```

## Lumen Code Review

[Lumen](https://github.com/jnsahaj/lumen) is installed with Cargo on Linux:

```sh
. "$HOME/.cargo/env"
cargo install lumen
```

Lumen is a separate review CLI and does not replace `delta` as Git's configured
pager. Run it explicitly from a Git repository:

```sh
lumen diff              # Review uncommitted changes
lumen diff HEAD~1        # Review the previous commit
lumen diff main..HEAD    # Compare the current branch with main
lumen explain            # Generate an AI explanation of current changes
```

The diff viewer works without an AI provider. Configure a provider before using
`lumen explain`, `lumen draft`, or the other AI commands:

```sh
lumen configure
```

## OpenWhispr on Linux

OpenWhispr is installed separately from this repo. Download the latest Ubuntu
`.deb` from the [OpenWhispr releases page](https://github.com/OpenWhispr/openwhispr/releases/latest),
then install it:

```sh
sudo apt install ./OpenWhispr-*-linux-amd64.deb
```

The package installs its launcher at `/opt/OpenWhispr/open-whispr` and a desktop
entry at `/usr/share/applications/open-whispr.desktop`. Rofi/wofi/dmenu-style
app launchers that read `.desktop` files should pick up **OpenWhispr** without
extra dotfile config.

This repo also provides a Linux-only `~/.local/bin/open-whispr` helper. It
launches OpenWhispr if needed, or focuses the existing window on sway/i3:

```sh
open-whispr
```

For local meeting transcription, start with local speech-to-text models in the
app settings: try Parakeet first for speed, then Whisper base/turbo/small for
quality comparison. On sway, if the window starts but does not appear focused,
the helper runs the equivalent of:

```sh
swaymsg '[class="open-whispr"] focus'
```

## Obsidian AppImage on Linux

Obsidian is installed separately; do not add its AppImage or extracted icon to
this repository. The managed `~/.local/bin/obsidian` helper and desktop entry
expect the AppImage at `~/Applications/Obsidian.AppImage`.

Download the current official GitHub release for this machine's architecture:

```sh
mkdir -p ~/Applications
case "$(uname -m)" in
  x86_64) obsidian_arch=x86_64 ;;
  aarch64|arm64) obsidian_arch=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
url="$(curl -fsSL https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest \
  | jq -r --arg arch "$obsidian_arch" '
      .assets[]
      | select(.name | endswith(".AppImage"))
      | select(if $arch == "arm64" then (.name | contains("arm64")) else (.name | contains("arm64") | not) end)
      | .browser_download_url' \
  | head -n1)"
test -n "$url" && test "$url" != "null"
curl -fL "$url" -o ~/Applications/Obsidian.AppImage
chmod 755 ~/Applications/Obsidian.AppImage
```

Extract the bundled icon once so the application launcher can display it:

```sh
workdir="$(mktemp -d)"
(
  cd "$workdir"
  ~/Applications/Obsidian.AppImage --appimage-extract >/dev/null
)
install -Dm644 "$workdir/squashfs-root/usr/share/icons/hicolor/512x512/apps/obsidian.png" \
  ~/.local/share/icons/hicolor/512x512/apps/obsidian.png
rm -rf "$workdir"
```

Run `chezmoi apply` after pulling these dotfiles to deploy the `obsidian`
helper and `~/.local/share/applications/obsidian.desktop` launcher. Launch it
from the application menu or with:

```sh
obsidian
```

The AppImage currently requires `--no-sandbox` on this machine because its
Chromium SUID sandbox cannot be configured from the mounted AppImage. The
managed helper supplies that flag. This disables Chromium's sandbox, so only
install AppImages from Obsidian's official release repository and keep
third-party plugins to ones you trust.

Replacing `~/Applications/Obsidian.AppImage` with a newer release updates
Obsidian; the helper, desktop entry, and extracted icon can remain in place.
On sway, `obsidian` focuses an existing window. If needed, focus it manually:

```sh
swaymsg '[app_id="obsidian"] focus'
```

## Pi Notifications on Linux

Pi completion and questionnaire notifications identify the project, session, and
Sway/i3 workspace. Middle-clicking a live Pi notification invokes its Dunst
action and focuses the terminal that produced it. Left-click remains ordinary
Dunst dismissal behavior. Start Pi with `pi --no-notifications` when another
parent application, such as Paseo, handles notifications for the session.

`Mod+n` recalls the latest item from Dunst's in-memory history. `Mod+Shift+n`
opens `pi-notification-history`, a wofi/rofi selector backed by the private,
durable log at `$XDG_STATE_HOME/pi/notifications.jsonl`; selecting a Pi event
focuses its recorded terminal when it still exists. The log retains the newest
500 Pi events and survives Dunst restarts. Dunst itself retains 200 events per
daemon lifetime; inspect them directly with `dunstctl history | jq`.

## Pi Settings and Chezmoi Sync

Pi treats `~/.pi/agent/settings.json` as live application state. Commands such
as `pi install`, `pi remove`, `/settings`, `/model`, and thinking-level changes
can edit that file directly. Chezmoi tracks the separate source copy at
`dot_pi/agent/settings.json`, so Pi changes can leave the live file and chezmoi
source out of sync.

To inspect Pi's live changes before pulling them into chezmoi, use a reverse
diff:

```sh
chezmoi diff --reverse ~/.pi/agent/settings.json
```

If the live Pi settings are correct, re-add the file to update the chezmoi
source:

```sh
chezmoi add ~/.pi/agent/settings.json
```

This matters when removing Pi packages. For example, after running
`pi remove npm:context-mode`, the live settings may have `"packages": []` while
the chezmoi source still contains `"npm:context-mode"`. Re-add the file before
committing dotfiles so `chezmoi apply` does not bring the removed package back.

## Pi Fast Mode

Pi defaults to the real `openai-codex/gpt-5.6-sol` model, with GPT-5.5 retained
as a temporary fallback in the model scope. The local extension at
`dot_pi/agent/extensions/service-tier-priority.ts` adds `/fast [on|off|toggle]`,
which toggles OpenAI `service_tier: "priority"` for supported GPT-5.4, GPT-5.5,
and GPT-5.6 family requests through OpenAI and OpenAI Codex. The toggle state
persists in the live Pi agent directory under
`~/.pi/agent/extensions/fast-mode/config.json`. This avoids fake priority model
aliases, so `/compact` can call a real Codex model id.

## Pi Compaction Model

The local extension at `dot_pi/agent/extensions/compaction-model.ts` routes manual
and automatic compaction through `openai-codex/gpt-5.6-luna`. It calls Pi's
built-in compaction implementation, preserving its structured summary, split-turn
handling, file tracking, custom instructions, and current thinking level. Use
`/compact-current [instructions]` for a one-off compaction with the active model
instead. The extension reports the model after each compaction and stores `compactionModel` in
Luna-generated compaction details for observability. If Luna or Codex auth is
unavailable, Pi falls back to compacting with the active model. DeepSeek Pro
remains available for model cycling and `worker-lite`; it was not a dedicated
compaction model before this extension.

## Pi Token Speed

The local extension at `dot_pi/agent/extensions/token-speed.ts` displays live
model throughput and time-to-first-token in Pi's footer. Live throughput uses
Pi's tokenizer-free `chars / 4` estimate and is marked with `~`; once a response
finishes, the extension reconciles the average against the provider-reported
output-token count. Tool execution time is excluded because each provider
response is measured independently.

The implementation was inspired by Gabriel Sanhueza's MIT-licensed
[`pi-token-speed`](https://github.com/gsanhueza/pi-token-speed), reviewed at
v0.7.0 (commit `75e0aca`), but is independently implemented and does not vendor
that package's source. Defaults live under `tokenSpeed` in
`dot_pi/agent/settings.json`.

## Pi Codex Usage Pace

The local extension at `dot_pi/agent/extensions/codex-usage-pace/` compares the
percentage of the weekly Codex quota period elapsed with the percentage of
quota consumed. It appears only for `openai-codex` models and renders separate
`t` (time) and `u` (usage) bars, their percentage-point pacing difference, and
the reset countdown in Pi's footer. It refreshes from Pi's Codex subscription
auth after settled runs and every three minutes, with Codex app-server as a
fallback.

## Pi Subagents

Pi's subagent extension provides specialized reconnaissance and implementation
subagents in isolated context windows:

- `scout`: fast, read-only static codebase reconnaissance using `google-vertex/gemini-3.8-flash:high`.
- `worker-lite`: economical implementation subagent for straightforward, bounded, low-risk tasks using `openai-codex/gpt-5.6-luna:high`.
- `worker`: implementation subagent for nontrivial, multi-file, or risky tasks using `openai-codex/gpt-5.6-terra:high` with optional per-invocation `effort: low|medium|high` (defaults to `high`).
- `browser`: browser automation worker for Playwright-driven UI investigation and testing using `openai-codex/gpt-5.6-luna`.

Planning and code review are handled directly in the main agent.

Install Tailscale separately, then authenticate:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

## Existing Stow Migration

If this machine was previously using `~/.dotfiles` with GNU Stow, unstow the old
packages before applying chezmoi so the symlinks do not conflict:

```sh
cd ~/.dotfiles
stow -D zsh git nvim zellij opencode alacritty fontconfig i3 sway polybar rofi xdg-desktop-portal-wlr xmodmap bin
chezmoi diff
chezmoi apply
```

## GitHub Credentials

This repo configures Git to use the GitHub CLI credential helper for GitHub and
Gist HTTPS remotes:

```ini
[credential "https://github.com"]
	helper = !gh auth git-credential
[credential "https://gist.github.com"]
	helper = !gh auth git-credential
```

Install `gh`, then authenticate once per machine:

```sh
gh auth login
```
