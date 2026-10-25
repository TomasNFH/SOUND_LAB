#!/bin/sh
# Download the sources for Drum Lab into tools/drums/.cache:
# - the Virtuosity Drums samples listed in samples.txt (about 20 MB of the
#   1.1 GB library, fetched file by file from its GitHub repo), and
# - the MIDI-only Groove MIDI Dataset (about 3 MB).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
cache="$here/.cache"
repo="https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/master"

mkdir -p "$cache/virtuosity"
cd "$cache/virtuosity"
curl -sSfL -o LICENSE "$repo/LICENSE"
while read -r path; do
  [ -z "$path" ] || [ -f "$path" ] && continue
  mkdir -p "$(dirname "$path")"
  curl -sSfL -o "$path" "$repo/$path" &
  # A few downloads at a time.
  [ "$(jobs -p | wc -l)" -ge 8 ] && wait
done < "$here/samples.txt"
wait
echo "Virtuosity Drums: $(find Samples -name '*.flac' | wc -l | tr -d ' ') samples"

if [ ! -d "$cache/groove" ]; then
  cd "$cache"
  curl -sSfL -o groove.zip https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0-midionly.zip
  unzip -q groove.zip && rm groove.zip
fi
echo "Groove MIDI Dataset: $cache/groove"
