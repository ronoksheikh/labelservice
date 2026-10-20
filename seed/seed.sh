#!/usr/bin/env sh
# Load demo courses into the local D1 database and their cover images into local R2.
set -e
cd "$(dirname "$0")/.."
bunx wrangler d1 execute twobytes --local --file=seed/demo.sql
for file in seed/covers/*.jpg; do
  bunx wrangler r2 object put "twobytes-media/demo/$(basename "$file")" --local --file="$file" --content-type=image/jpeg
done
