#!/usr/bin/env sh
set -eu
test "$(id -u)" -eq 0 || { printf 'Run with sudo.\n' >&2; exit 1; }

cat > /etc/systemd/system/shared-postgres-backup.service <<'EOF'
[Unit]
Description=Verified backup of all shared PostgreSQL databases
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=root
Environment=INFRA_ROOT=/opt/infrastructure/postgres
ExecStart=/opt/infrastructure/postgres/bin/backup-databases.sh
StandardOutput=append:/var/log/shared-postgres-backup.log
StandardError=append:/var/log/shared-postgres-backup.log
EOF

cat > /etc/systemd/system/shared-postgres-backup.timer <<'EOF'
[Unit]
Description=Nightly shared PostgreSQL backup

[Timer]
OnCalendar=*-*-* 02:15:00 UTC
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now shared-postgres-backup.timer
systemctl list-timers shared-postgres-backup.timer
