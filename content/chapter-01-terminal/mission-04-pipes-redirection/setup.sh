#!/usr/bin/env bash
# Mission 04 setup - gives the player an orders.csv and an app.log to work
# with. orders.csv has a known row count and a few EU rows so the validator
# can verify each step.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/counted_orders \
      /tmp/.cosmos/appended_log \
      /tmp/.cosmos/piped_to_grep \
      /tmp/.cosmos/wrote_eu_orders

rm -rf "$HOME/work" 2>/dev/null || true
mkdir -p "$HOME/work"

# Build a small CSV with a deterministic number of rows. Using `seq` so the
# count check is repeatable.
{
  echo 'order_id,region,amount'
  for i in $(seq 1 12); do
    case $((i % 3)) in
      0) region="EU" ;;
      1) region="NA" ;;
      2) region="APAC" ;;
    esac
    printf 'ORD-%03d,%s,%d\n' "$i" "$region" "$((100 + i * 7))"
  done
} > "$HOME/work/orders.csv"

# 13 lines total: 1 header + 12 data rows. Player will count 13 (or 12 if they
# strip the header) - we accept both.

cat > "$HOME/work/app.log" <<'EOF'
2026-05-06T08:00:00Z INFO  app booted
2026-05-06T08:00:01Z INFO  config loaded
EOF

cd "$HOME"
exit 0
