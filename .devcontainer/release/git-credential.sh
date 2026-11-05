#!/bin/sh
set -eu
# Answer only HTTPS requests for the canonical public plugin repository.
[ "${1:-}" = get ] || exit 0
task_protocol= task_host= task_path=
while IFS='=' read -r task_key task_value; do
    case "$task_key" in
        protocol) task_protocol=$task_value ;;
        host) task_host=$task_value ;;
        path) task_path=$task_value ;;
    esac
done
[ "$task_protocol" = https ] && [ "$task_host" = github.com ] || exit 0
case "$task_path" in
    haandol/pixelbank-plugin|haandol/pixelbank-plugin.git) ;;
    *) exit 0 ;;
esac
[ -s /run/credentials/github-token ] || exit 0
printf 'username=x-access-token\npassword='
cat /run/credentials/github-token
printf '\n\n'
