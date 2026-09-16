#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo "Native iOS compilation requires macOS and Xcode 26 or later." >&2
  exit 1
fi
command -v xcodebuild >/dev/null || { echo "Install Xcode and select it with xcode-select." >&2; exit 1; }
if [[ ! -f ios/App/App/public/ios-bundle.json ]]; then
  echo "Run npm ci and npm run ios:sync first." >&2
  exit 1
fi
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
