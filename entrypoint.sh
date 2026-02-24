#!/bin/sh
chown -R node:node /data
exec su-exec node "$@"

