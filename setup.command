#!/usr/bin/env bash
# Double-click in Finder to set up Talaan on a Mac (runs setup.sh in Terminal).
cd "$(dirname "$0")" && bash ./setup.sh "$@"
echo
read -r -p "Press Enter to close this window. " _
