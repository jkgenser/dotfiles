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
