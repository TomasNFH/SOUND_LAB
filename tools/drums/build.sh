#!/bin/sh
# Rebuild Drum Lab's samples (web/public/drums/kit) and grooves
# (web/src/drums/grooves.ts) from the sources download.sh fetched.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
cache="$here/.cache"

[ -d "$cache/virtuosity/Samples" ] && [ -d "$cache/groove" ] || "$here/download.sh"

python3 "$here/build_kit.py" "$cache/virtuosity/Samples" "$cache/work" "$root/web/public/drums/kit"
python3 "$here/build_grooves.py" "$cache/groove" "$root/web/src/drums/grooves.ts"
