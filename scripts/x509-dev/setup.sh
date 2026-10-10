#!/usr/bin/env bash
# Generates the dev CA, server cert and client cert (idempotent).
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f ca.pem || ! -f ca.key ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ca.key
  openssl req -x509 -new -key ca.key -sha256 -days 825 -subj "/CN=rabbit-studio-x509-ca" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" -out ca.pem
  rm -f server.pem client.pem
  echo "created CA"
fi

if [[ ! -f server.pem || ! -f server.key ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out server.key
  openssl req -new -key server.key -subj "/CN=localhost" -out server.csr
  printf '%s\n' "subjectAltName=DNS:localhost,DNS:rabbit-x509,IP:127.0.0.1" \
    "basicConstraints=CA:FALSE" "keyUsage=digitalSignature,keyEncipherment" \
    "extendedKeyUsage=serverAuth,clientAuth" > server.ext
  openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -sha256 -days 825 \
    -extfile server.ext -out server.pem
  rm -f server.csr server.ext
  echo "created server cert"
fi

if [[ ! -f client.pem || ! -f client.key ]]; then
  # genpkey emits an unencrypted PKCS#8 PEM key
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out client.key
  openssl req -new -key client.key -subj "/CN=admin" -out client.csr
  printf '%s\n' "basicConstraints=CA:FALSE" "keyUsage=digitalSignature" \
    "extendedKeyUsage=clientAuth" > client.ext
  openssl x509 -req -in client.csr -CA ca.pem -CAkey ca.key -CAcreateserial -sha256 -days 825 \
    -extfile client.ext -out client.pem
  rm -f client.csr client.ext
  echo "created client cert"
fi

# The rabbitmq (uid 999) and nginx users inside the containers must read the
# bind-mounted key; dev-only keys, so world-readable is acceptable here.
chmod 644 ca.pem server.pem server.key client.pem client.key
chmod 600 ca.key
