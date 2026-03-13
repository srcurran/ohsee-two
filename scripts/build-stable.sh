#!/bin/bash
# Build the current commit as "stable" baseline for self-testing.
# Usage: ./scripts/build-stable.sh
# Then:  npm run start:stable
set -e
cd "$(dirname "$0")/.."
echo "Building stable baseline from $(git rev-parse --short HEAD)..."
npm run build
echo "Done. Start with: npm run start:stable"
