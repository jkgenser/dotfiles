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
curl -fsSL https://opencode.ai/install | bash
```

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
