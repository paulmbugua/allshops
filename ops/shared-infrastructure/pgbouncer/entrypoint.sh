#!/bin/sh
set -eu

install -o nobody -g nobody -m 600 \
  /run/secrets-source/pgbouncer-users.txt /run/pgbouncer/userlist.txt
exec su-exec nobody pgbouncer "$@"
