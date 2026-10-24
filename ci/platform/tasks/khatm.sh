#!/bin/sh
# Runs khatm's CLI inside the running sign-in container, over its Unix socket:
# trusted by filesystem access, no guard, every use audited as `socket`. It is
# how users are looked after (sets a password, gives a role) and the
# break-glass path when a bad config breaks sign-in. Whatever follows the
# task's name is the CLI's own arguments:
#
#   ens delivery task platform khatm users list
#   ens delivery task platform khatm users create you@example.com --role operator --password-stdin
#   ens delivery task platform khatm users set-role you@example.com operator
#   ens delivery task platform khatm status
set -eu

for var in project artifact; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "khatm: missing required env: $var" >&2
    echo "Run it as a task, which supplies both from the manifest:" >&2
    echo "  ens delivery task platform khatm <command>" >&2
    exit 1
  fi
done

if [ "$#" -eq 0 ]; then
  echo "khatm: give the CLI's command, e.g. users list" >&2
  exit 1
fi

# -T: no terminal, so `users set-password` can read the password from stdin.
exec docker compose -f "$artifact" -p "$project" exec -T auth khatm "$@"
