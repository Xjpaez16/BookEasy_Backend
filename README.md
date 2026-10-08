# BookEasy Backend — Agenda Pro

Multi-tenant B2B SaaS backend for appointment-based small businesses.

## Stack
Bun + Elysia + TypeScript · Drizzle ORM + PostgreSQL · Redis · Hexagonal Architecture (modular monolith).

## Architecture
Dependency direction: **Infrastructure → Adapters → Application → Domain**.

```
src/
  config/            env loading & validation (Zod)
  shared/            cross-cutting domain errors + application ports
  modules/<ctx>/     one bounded context per folder:
    domain/          entities, value objects, invariants (no frameworks)
    application/
      ports/         interfaces the use cases depend on
      use-cases/     orchestration of domain + ports
    adapters/
      http/          Elysia controllers/routes (thin)
      persistence/   Drizzle repositories implementing ports
  infrastructure/    db client, http wiring, redis, security, jobs
tests/               unit · integration · e2e
```

Bounded contexts: `auth`, `business`, `staff`, `services`, `customers`,
`appointments`, `dashboard`, `notifications`, `subscriptions`, `audit`.

## Rules
- `business_id` always comes from the authenticated context — never trusted from the client.
- Timestamps stored in UTC; business timezone stored separately.
- Money in integer minor units.
- No SQL or business logic in controllers.

## Getting started
```bash
cp .env.example .env
bun install
docker compose up -d db redis
bun run db:generate && bun run db:migrate
bun run dev
```

### Without Docker (native, lighter on RAM)

Install PostgreSQL 16 + Redis once (in your own terminal — a sandboxed agent
cannot run Homebrew's installer):

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

Then provision the role/db and apply migrations with the helper script:

```bash
cp .env.example .env
bun install
bash scripts/dev-db-setup.sh   # creates the bookeasy role+db, runs migrations
bun run dev                    # API on :3000
bun run worker:dev             # reminders worker (needs Redis)
curl localhost:3000/ready      # -> {"status":"ready"}
```

Inspect the database visually any time with `bun run db:studio`
(opens https://local.drizzle.studio).

## Scripts
`dev` · `start` · `build` · `typecheck` · `lint` · `test` · `test:unit` · `test:integration` · `test:e2e` · `db:generate` · `db:migrate` · `db:studio`
