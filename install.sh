#!/bin/bash

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR=~/dotfiles_backup

# Create backup directory
mkdir -p $BACKUP_DIR

# List of dotfiles to symlink
files=".vimrc .bashrc .zshrc .gitconfig"

for file in $files; do
  if [ -e ~/$file ]; then
    mv ~/$file $BACKUP_DIR/
  fi
  ln -s $DOTFILES_DIR/$file ~/$file
done
