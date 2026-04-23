#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_DIR="$ROOT_DIR/artifacts"

OPENCODE_REPO="${OPENCODE_REPO:-}"
BRIDGE_REPO="${BRIDGE_REPO:-/data/projects/bridge/cli}"

mkdir -p "$ARTIFACTS_DIR"

echo "Building local artifacts into: $ARTIFACTS_DIR"

if [ -z "$OPENCODE_REPO" ]; then
  echo "ERROR: OPENCODE_REPO is not set."
  echo "Set it to local opencode-ai package directory, for example:"
  echo "  OPENCODE_REPO=/data/projects/opencode ./scripts/build-local-artifacts.sh"
  exit 1
fi

if [ ! -f "$OPENCODE_REPO/package.json" ]; then
  echo "ERROR: OPENCODE_REPO does not contain package.json: $OPENCODE_REPO"
  exit 1
fi

if [ ! -f "$BRIDGE_REPO/package.json" ]; then
  echo "ERROR: BRIDGE_REPO does not contain package.json: $BRIDGE_REPO"
  exit 1
fi

echo "Packing opencode from: $OPENCODE_REPO"
OPENCODE_TGZ_NAME="$(npm pack "$OPENCODE_REPO" --silent | tail -n 1)"
mv "$ROOT_DIR/$OPENCODE_TGZ_NAME" "$ARTIFACTS_DIR/$OPENCODE_TGZ_NAME"

echo "Packing bridge from: $BRIDGE_REPO"
BRIDGE_TGZ_NAME="$(npm pack "$BRIDGE_REPO" --silent | tail -n 1)"
mv "$ROOT_DIR/$BRIDGE_TGZ_NAME" "$ARTIFACTS_DIR/$BRIDGE_TGZ_NAME"

echo "Artifacts ready:"
ls -1 "$ARTIFACTS_DIR"/*.tgz
