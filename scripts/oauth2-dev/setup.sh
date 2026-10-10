#!/usr/bin/env bash
# Generates the RSA keypair (idempotent).
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f private.pem || ! -f public.pem ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
  openssl rsa -in private.pem -pubout -out public.pem
fi
# readable by the rabbitmq user inside the container
chmod 644 public.pem
chmod 600 private.pem
echo "keys ready"
