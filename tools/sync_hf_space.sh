#!/usr/bin/env bash
# Refresh the Hugging Face Space folder from the current build:  python3 build.py && bash tools/sync_hf_space.sh
set -e
cp dist/orbital_dominion_v4.html hf-space/index.html
cp docs/brand/logo-action-512.png hf-space/logo.png
echo "hf-space/ refreshed. Upload its contents to your Space (README.md, index.html, logo.png)."
