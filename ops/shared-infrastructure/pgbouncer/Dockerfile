FROM alpine:3.22

RUN apk add --no-cache pgbouncer postgresql-client ca-certificates su-exec \
  && mkdir -p /etc/pgbouncer /var/run/pgbouncer \
  && chown -R nobody:nobody /var/run/pgbouncer

COPY entrypoint.sh /usr/local/bin/pgbouncer-entrypoint
RUN chmod 755 /usr/local/bin/pgbouncer-entrypoint

EXPOSE 6432
ENTRYPOINT ["/usr/local/bin/pgbouncer-entrypoint"]
CMD ["/etc/pgbouncer/pgbouncer.ini"]
