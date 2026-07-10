# MySQL CDC Login Demo

This is a home task project with a login flow that's wired up with change
data capture (CDC) end to end. There's a login form that talks to an Express
API, which is backed by MySQL. Every change to the `users` and `user_tokens`
tables gets picked up off the MySQL binlog by Debezium, pushed into Kafka,
and printed out by a small consumer. It's a toy example, but the plumbing is
basically the same as what you'd use in a real event-driven system.
Within the time given to me, I managed to set up the application with an approach that aspires to be best practice/

## How the pieces fit together

The frontend is just a static login form served by nginx, which proxies
requests to the backend (an Express API running `bootstrap.js`). The backend
talks to MySQL to check credentials and issue tokens. MySQL has its binlog
turned on, and Debezium (running inside Kafka Connect) watches that binlog
and turns every row change into an event on Kafka. A separate consumer
service just subscribes to those Kafka topics and prints whatever comes
through.

So in short: frontend -> backend -> MySQL -> (binlog) -> Debezium -> Kafka ->
consumer.

The services involved are:

- **mysql** – the database, holds `users` and `user_tokens`, binlog enabled
- **zookeeper** – needed for Kafka to coordinate
- **kafka** – the message broker the CDC events flow through
- **connect** – Kafka Connect, this is what actually runs the Debezium connector
- **connector-init** – a one-off job that registers the Debezium connector on startup
- **backend** – the login API, logs everything with log4js
- **frontend** – the login page, served through nginx
- **cdc-consumer** – prints out whatever change events show up on Kafka

## Setting it up

All the credentials, ports, and topic/connector names are kept in a `.env`
file rather than being hardcoded into `docker-compose.yml` or the code
itself. Before running anything, copy the example file and adjust it:

```bash
cp .env.example .env
```

Take a look at `.env.example` for the full list of variables — MySQL
root/app/Debezium credentials, host ports, Kafka Connect topic names, the
connector name, etc. `.env` itself is git-ignored, and it should stay that
way — don't put real secrets in a committed file.

## Running it

```bash
docker compose up -d --build
```

The services wait on each other properly using `depends_on` with
`condition: service_healthy` (or `service_completed_successfully`), so
nothing starts before what it depends on is actually ready. The rough order
is: mysql, then zookeeper, then kafka, then connect, then connector-init,
then cdc consumer. Backend waits on mysql, and frontend waits on backend.

To check everything came up fine:

```bash
docker compose ps
```

## Trying it out

I set the port for the database to 3307 because port 3306 was taken.
Open the login form in your browser at http://localhost:8080 (or whatever
port you set for `FRONTEND_HOST_PORT` in `.env`).

There's a seed user already in the database (see `mysql/01-schema.sql`):
username `demo`, password `Password123!`.
you can try to login also with the mail `demo@example.com`

If you'd rather skip the UI, you can hit the API directly (default port is
3000, from `BACKEND_HOST_PORT`):

```bash
curl -X POST http://localhost:3000/login \
  -H 'Content-Type: application/json' \
  -d '{"usernameOrEmail":"demo","password":"Password123!"}'
```

That returns a token. Use it on the following requests like this:

```bash
curl http://localhost:3000/me -H "x-auth-token: <token>"
curl -X POST http://localhost:3000/logout -H "x-auth-token: <token>"
```

Every login attempt, whether it succeeds or fails, gets logged by the
backend as a single line of JSON (timestamp, user id, action, IP) through
log4js. You can watch it live with:

```bash
docker compose logs -f backend
```

## Watching the CDC events

Once the connector has registered itself (it's built from
`debezium/mysql-connector.json.template`, filled in with your `.env` values
by `debezium/register-connector.sh`), any insert, update, or delete on
`users` or `user_tokens` gets streamed straight from the binlog into Kafka.
That includes the token row that gets written every time someone logs in.

By default the topics are named `dbserver1.app_db.users` and
`dbserver1.app_db.user_tokens` (built from `TOPIC_PREFIX` and
`MYSQL_DATABASE`). The consumer just prints each event as it comes in:

```bash
docker compose logs -f cdc-consumer
```

If you log in again while watching that log, you'll see the consumer output
update right away — that's the whole pipeline working end to end.

You can also check on the connector itself directly (the name comes from
`CONNECTOR_NAME` in `.env`, `mysql-users-connector` by default):

```bash
curl http://localhost:8083/connectors/mysql-users-connector/status
```

## What's in the repo

- `docker-compose.yml` — brings everything up
- `.env.example` — template for your own `.env`
- `mysql/01-schema.sql` — the `users`/`user_tokens` schema plus the seed user
- `mysql/02-create-users.sh` — creates the app and Debezium MySQL users from env vars
- `debezium/mysql-connector.json.template` — the Debezium connector config, templated
- `debezium/register-connector.sh` — fills in the template and registers the connector
- `backend/` — the Express app: `bootstrap.js` (login/logout/me routes), `db.js` (MySQL pool), `logger.js` (log4js setup)
- `consumer/consumer.js` — the Kafka consumer that prints CDC events
- `frontend/` — the login page, plus `nginx.conf` which proxies `/api/` to the backend

## Things I'd do differently for production

- Secrets and config live in `.env` now instead of being hardcoded, which is
  a big improvement, but for a real deployment I'd still want these coming
  from an actual secrets manager (Vault, AWS Secrets Manager, whatever) that
  gets injected at deploy time. A `.env` file on disk is still just plain
  text sitting there.
- I didn't touch binlog retention, Kafka topic retention, or any kind of
  replica/HA setup for MySQL or Kafka — that's all out of scope for a demo
  like this, but it'd be the next thing to sort out before this went
  anywhere near real traffic.
- The frontend keeps the token in `sessionStorage` right now, mostly for
  simplicity. A real app should use an httpOnly cookie instead so an XSS bug
  can't just walk off with someone's token.

## Project Focus & Trade-offs: 

While I came in with a good conceptual understanding of Kafka and Debezium, 
properly configuring the CDC pipeline and integrating it tightly with MySQL binlogs 
proved to be the primary technical challenge. I made a conscious engineering decision 
to invest the bulk of my time ensuring the data streaming infrastructure was robust and 
functional, keeping the frontend and backend implementations intentionally minimal 
to prioritize the DevOps and SRE requirements.

## To Do in the future
- Add automated tests , unit tests for the backend login/token logic and an
  end-to-end test that drives a login through the API and asserts the
  matching CDC event actually shows up on the Kafka topic.
- Add observability for the pipeline itself: consumer lag metrics, Kafka
  Connect/Debezium connector health checks, and a Grafana dashboard so a
  stuck or failing connector doesn't go unnoticed.
- Move from raw JSON Kafka messages to a schema registry , so producers and consumers can evolve the `users`/
  `user_tokens` schema without silently breaking each other.
- Give the consumer proper error handling — retries with backoff and a
  dead-letter topic for events it can't process, instead of assuming every
  message is well-formed.
- Harden the login endpoint with rate limiting or maybe lockout after repeated
  failed attempts, and move the frontend token storage from
  `sessionStorage` to an httpOnly cookie as noted above.
