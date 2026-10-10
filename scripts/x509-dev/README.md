# x509-dev

RabbitMQ 4.2 broker for testing client-certificate (x509) login, plus an nginx mTLS proxy in front of the management API.

## Usage

    ./up.sh     # generates certs (setup.sh, idempotent) and starts both containers
    ./down.sh

## Ports

| Host | Container | What |
| --- | --- | --- |
| 127.0.0.1:5678 | rabbit-studio-x509:5671 | AMQP over TLS, SASL EXTERNAL (user = cert CN) |
| 127.0.0.1:15678 | rabbit-studio-x509-proxy:443 | Management API via nginx mTLS; nginx injects `Authorization: Basic admin:admin` |

Management (15672) is not published; it is reachable only through the proxy.

## Files

- `setup.sh` creates `ca.pem/ca.key`, `server.pem/server.key` (CN=localhost, SAN localhost, rabbit-x509, 127.0.0.1), `client.pem/client.key` (CN=admin, clientAuth, unencrypted PKCS#8). All are gitignored. Keys are chmod 644 so the container users can read them (dev only).
- `rabbitmq.conf`, `enabled_plugins`, `nginx.conf`, `docker-compose.yml`.

## Verified

    curl --cacert ca.pem --cert client.pem --key client.key https://localhost:15678/api/whoami
    -> 200 {"name":"admin","tags":["administrator"],...}
    curl --cacert ca.pem https://localhost:15678/api/whoami          (no client cert)
    -> 400
    openssl s_client -connect 127.0.0.1:5678 -cert client.pem -key client.key -CAfile ca.pem
    -> TLSv1.3, Verify return code: 0 (ok)
    AMQP 0-9-1 header over that TLS session -> Connection.Start lists EXTERNAL and PLAIN
    docker exec rabbit-studio-x509 rabbitmq-diagnostics -q listeners -> amqp/ssl on 5671
    rabbitmq-diagnostics -q environment | grep -i auth_mechanisms -> ['EXTERNAL','PLAIN']
    rabbitmqctl list_users -> admin [administrator]
