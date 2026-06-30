#!/usr/bin/env bash
# Mission 07 validator. Mix of history (for export/alias which leave no fs trace)
# and filesystem (for the script + its output).

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
mark()  { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# exported_env - history shows `export COSMOS_ROLE=…`. Accept any value.
if ! done_q exported_env; then
  grep -Eq '(^|[[:space:];|&(`])export[[:space:]]+COSMOS_ROLE=' "$HIST" 2>/dev/null \
    && mark exported_env
fi

# defined_alias - history shows `alias gs=…git status…` (any quoting).
if ! done_q defined_alias; then
  grep -Eq '(^|[[:space:];|&(`])alias[[:space:]]+gs=.*git[[:space:]]+status' "$HIST" 2>/dev/null \
    && mark defined_alias
fi

# wrote_hello_script - file exists, contains an echo of "hello cosmos", and has
# a shebang on the first line.
if ! done_q wrote_hello_script; then
  f="$HOME/work/hello.sh"
  if [ -f "$f" ]; then
    first="$(head -n 1 "$f" 2>/dev/null)"
    case "$first" in
      '#!'*) has_shebang=1 ;;
      *)     has_shebang=0 ;;
    esac
    if [ "$has_shebang" = "1" ] \
       && grep -Eiq 'echo[[:space:]]+["'\'']?hello[[:space:]]+cosmos' "$f"; then
      mark wrote_hello_script
    fi
  fi
fi

# ran_hello_script - the redirected output file contains the expected string.
if ! done_q ran_hello_script; then
  f="$HOME/work/hello.out"
  if [ -f "$f" ] && grep -Fq 'hello cosmos' "$f"; then
    mark ran_hello_script
  fi
fi

exit 0
