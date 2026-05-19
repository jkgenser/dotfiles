# dotfiles

Personal dotfiles managed with [chezmoi](https://www.chezmoi.io/).

## macOS Bootstrap

```sh
brew install chezmoi
chezmoi init --apply jkgenser/dotfiles
brew bundle --file ~/.local/share/chezmoi/Brewfile
```

## Linux Bootstrap

Install chezmoi, then initialize and apply this repo:

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
chezmoi init --apply jkgenser/dotfiles
```

`chezmoi init jkgenser/dotfiles` uses chezmoi's repo URL guessing. For a
`user/repo` argument, chezmoi assumes GitHub over HTTPS and clones:

```text
https://github.com/jkgenser/dotfiles.git
```

If SSH is preferred and GitHub SSH keys are already set up, use:

```sh
chezmoi init --ssh --apply jkgenser/dotfiles
```

After bootstrap, install platform packages with the system package manager as
needed. The Homebrew `Brewfile` is mainly for macOS.

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
