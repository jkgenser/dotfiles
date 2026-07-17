# dotfiles

Personal dotfiles managed with [chezmoi](https://www.chezmoi.io/).

This repo currently supports macOS and Linux desktop machines. Linux server or
headless profiles are intentionally deferred for now.

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
sudo apt-get install -y git git-lfs curl wget unzip build-essential zsh ripgrep fd-find jq htop tree ca-certificates gnupg lsb-release alacritty i3 sway waybar wofi rofi polybar xdg-desktop-portal-wlr x11-xserver-utils xinput xss-lock i3lock network-manager-gnome pulseaudio-utils fontconfig
```

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
curl -fsSL https://pi.dev/install.sh | sh
curl -fsSL https://opencode.ai/install | bash
```

The shell config adds `~/.local/bin`, `~/.pi/bin`, and Pi's managed Node path
when present so locally installed Pi is visible on Linux and macOS.

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

Pi's subagent extension provides three implementation tiers. `worker-lite` uses
`openai-codex/gpt-5.6-luna` for straightforward, bounded, low-risk work;
`worker` uses `openai-codex/gpt-5.6-terra` for nontrivial or moderately risky
work; and `worker-max` uses `openai-codex/gpt-5.6-sol` for the broadest, most
ambiguous, or highest-risk work. `worker-lite` accepts
`effort: high|xhigh|max` and defaults to `high`; `worker` and `worker-max`
accept `effort: medium|high|xhigh` and default to `medium`. Model tier and
reasoning intensity can therefore be selected independently.

For static review, `reviewer-lite` uses `openai-codex/gpt-5.6-luna:xhigh` for
focused, bounded, low-risk review requests, while `reviewer` retains
`openai-codex/gpt-5.6-sol:xhigh` for broad, complex, or high-risk review. The
isolated pull-request workflow continues to use the separately hardened
`pr-reviewer` agent.

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
