# OAuth 2 dev broker

RabbitMQ 4.2 with `rabbit_auth_backend_oauth2` (first) and the internal backend (fallback),
plus a dependency-free OpenID token server issuing client-credentials JWTs.

## Run

    ./up.sh     # generates keys (setup.sh), starts container rabbit-studio-oauth and the token server
    ./down.sh   # stops both

- Management API: http://127.0.0.1:15677 (container 15672)
- AMQP: 127.0.0.1:5677 (container 5672)
- Issuer: http://127.0.0.1:8099 (discovery at `/.well-known/openid-configuration`, token endpoint `/token`)
- Client id `rabbit-studio`, secret `s3cret` (body or HTTP Basic), scope tags `administrator`, full `*/*` permissions
- Internal user `admin` / `admin` still works
- Keys (`private.pem`, `public.pem`) are generated locally and git-ignored; token server pid/log are in this folder

## Get a token

    TOKEN=$(curl -s -X POST localhost:8099/token -d grant_type=client_credentials \
      -d client_id=rabbit-studio -d client_secret=s3cret | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')

## Verified (2026-10-10)

| Check | Result |
| --- | --- |
| Wrong client secret on `/token` | 401 |
| `curl -H "Authorization: Bearer $TOKEN" localhost:15677/api/whoami` | 200, name `rabbit-studio`, tag administrator |
| Same header on `/api/overview` | 200 |
| `curl -u "x:$TOKEN" localhost:15677/api/whoami` (token as basic password, any username) | 200, name `rabbit-studio` |
| `curl -u admin:admin localhost:15677/api/whoami` | 200, name `admin` |
| `docker exec rabbit-studio-oauth rabbitmqctl authenticate_user any "$TOKEN"` | Success |

Accepted auth forms: Bearer header, token as basic-auth password (any username), token as AMQP
password (confirmed via `authenticate_user`, not with a real AMQP client), and admin/admin.
Tokens last 300 s.
