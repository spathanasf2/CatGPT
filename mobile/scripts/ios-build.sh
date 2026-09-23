#!/bin/zsh
# Builds Aineko for iOS on the Mac and, with --upload, sends it to App Store Connect.
#
#   scripts/ios-build.sh foundry [--upload]   # TestFlight testing against the tailnet dev server
#   scripts/ios-build.sh hetzner [--upload]   # production (aineko.bromsg.com) -- the one to submit
#
# The server and the icon are chosen together, so a build can't talk to one server while wearing
# the other's icon (Frank, 2026-09-23): foundry = dark icon (AppIcon-Foundry), hetzner = light
# (AppIcon, the real one). Both TestFlight builds land in the same place, and the icon is how
# Frank tells them apart on his phone.
#
# Version and build number come from project.pbxproj: bump CURRENT_PROJECT_VERSION in the repo,
# commit, rsync mobile/ to the Mac (excluding .env.local), then run this. Before anything is
# uploaded it checks that the bundle points at the right server and the archive carries the right
# icon; .env.local is always put back to production on exit, even on failure. Without --upload it
# builds a throwaway archive in ~/aineko-build/dry-run-<target> to check both.
set -euo pipefail

target=${1:-}
upload=${2:-}
case $target in
  foundry) envfile=~/aineko-build/env.local.foundry; icon=AppIcon-Foundry ;;
  hetzner) envfile=~/aineko-build/env.local.production; icon=AppIcon ;;
  *) print "usage: $0 <foundry|hetzner> [--upload]"; exit 1 ;;
esac

repo=~/aineko/mobile
xcodebuild=/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild
pbxproj=$repo/ios/App/App.xcodeproj/project.pbxproj
version=$(grep -m1 -o 'MARKETING_VERSION = [0-9.]*' $pbxproj | awk '{print $3}')
build=$(grep -m1 -o 'CURRENT_PROJECT_VERSION = [0-9]*' $pbxproj | awk '{print $3}')

if [[ $upload == --upload ]]; then
  out=~/aineko-build/$version-$build
  if [[ -e $out ]]; then
    print "$out already exists -- bump CURRENT_PROJECT_VERSION first"
    exit 1
  fi
else
  out=~/aineko-build/dry-run-$target
  rm -rf $out
fi
mkdir -p $out

cd $repo
trap 'cp ~/aineko-build/env.local.production $repo/.env.local' EXIT
cp $envfile .env.local
print "== $target: $version ($build), $(grep SERVER_URL .env.local)"

npm run build > $out/web-build.log 2>&1
chunks=(out/_next/static/chunks/*.js)
if [[ $target == foundry ]]; then
  grep -q '"https://foundry.tail567d18.ts.net:8446"' $chunks || { print "bundle is not pointed at foundry"; exit 1; }
else
  grep -q 'ts\.net' $chunks && { print "production bundle mentions the tailnet"; exit 1; }
  grep -q '"https://aineko.bromsg.com"' $chunks || { print "bundle is not pointed at production"; exit 1; }
fi
npx cap sync ios > $out/cap-sync.log 2>&1

cd $repo/ios/App
$xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -sdk iphoneos \
  -destination generic/platform=iOS -archivePath $out/App.xcarchive \
  ASSETCATALOG_COMPILER_APPICON_NAME=$icon CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  archive > $out/archive.log 2>&1

plist=$out/App.xcarchive/Products/Applications/App.app/Info.plist
got=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIcons:CFBundlePrimaryIcon:CFBundleIconName' $plist)
if [[ $got != $icon ]]; then
  print "archive carries icon $got, expected $icon"
  exit 1
fi
print "== archived: icon $got, build $(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' $plist)"

if [[ $upload == --upload ]]; then
  cat > $out/ExportOptions.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>WRU32M8YQ8</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
EOF
  $xcodebuild -exportArchive -archivePath $out/App.xcarchive -exportPath $out/export \
    -exportOptionsPlist $out/ExportOptions.plist -allowProvisioningUpdates > $out/upload.log 2>&1 || true
  if grep -q 'Upload succeeded' $out/upload.log; then
    print "== uploaded $version ($build) [$target]"
  else
    print "upload failed -- see $out/upload.log (a vague Apple server-side error usually just needs a retry)"
    exit 1
  fi
fi
