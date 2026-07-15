#!/usr/bin/env bash
set -euo pipefail

DEPLOY_SWAP_SIZE_GB="${DEPLOY_SWAP_SIZE_GB:-2}"

if ! [[ "$DEPLOY_SWAP_SIZE_GB" =~ ^[0-9]+$ ]]; then
  echo "DEPLOY_SWAP_SIZE_GB must be a non-negative integer." >&2
  exit 1
fi

if [[ "$DEPLOY_SWAP_SIZE_GB" == "0" ]]; then
  exit 0
fi

memory_kb="$(awk '/MemTotal/ { print $2; exit }' /proc/meminfo)"
if [[ -n "$memory_kb" && "$memory_kb" -ge 4194304 ]]; then
  exit 0
fi

if tail -n +2 /proc/swaps | grep -q '[^[:space:]]'; then
  exit 0
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Root privileges are required to create swap." >&2
  exit 1
fi

if [[ ! -f /swapfile ]]; then
  if command -v fallocate >/dev/null 2>&1; then
    fallocate -l "${DEPLOY_SWAP_SIZE_GB}G" /swapfile
  else
    dd if=/dev/zero of=/swapfile bs=1M count="$((DEPLOY_SWAP_SIZE_GB * 1024))" status=progress
  fi
fi

chmod 600 /swapfile
if [[ "$(blkid -s TYPE -o value /swapfile 2>/dev/null || true)" != "swap" ]]; then
  mkswap /swapfile >/dev/null
fi
swapon /swapfile

if ! grep -Eq '^/swapfile[[:space:]]+none[[:space:]]+swap[[:space:]]' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

echo "Enabled ${DEPLOY_SWAP_SIZE_GB} GiB persistent swap at /swapfile."
