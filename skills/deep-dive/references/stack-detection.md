# Tech Stack Detection Patterns

Quick reference for identifying technologies across ecosystems.

## Language Detection

| File / Pattern | Language |
|---|---|
| `package.json` | JavaScript / TypeScript |
| `tsconfig.json` | TypeScript |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pyproject.toml`, `setup.py`, `requirements.txt` | Python |
| `pom.xml`, `build.gradle` | Java / Kotlin |
| `Gemfile` | Ruby |
| `composer.json` | PHP |
| `*.csproj`, `*.sln` | C# / .NET |
| `Package.swift` | Swift |
| `mix.exs` | Elixir |
| `pubspec.yaml` | Dart / Flutter |
| `deno.json`, `deno.jsonc` | Deno (TypeScript/JavaScript) |
| `bunfig.toml`, `bun.lockb` | Bun (TypeScript/JavaScript) |
| `gleam.toml` | Gleam |
| `zig.zon`, `build.zig` | Zig |
| `v.mod` | V |

## Framework Detection by Ecosystem

### JavaScript / TypeScript

| Indicator | Framework |
|---|---|
| `next` in deps | Next.js |
| `nuxt` in deps | Nuxt.js |
| `react` in deps | React |
| `vue` in deps | Vue.js |
| `angular` in deps | Angular |
| `svelte` in deps | Svelte / SvelteKit |
| `express` in deps | Express.js |
| `fastify` in deps | Fastify |
| `nestjs` in deps | NestJS |
| `hono` in deps | Hono |
| `@remix-run` in deps | Remix |
| `astro` in deps | Astro |
| `@solidjs/router` in deps | SolidJS |
| `qwik` in deps | Qwik |

### Deno

| Indicator | Framework |
|---|---|
| `deno.json` with `imports` | Deno native |
| `fresh` in imports | Fresh (Deno web framework) |
| `oak` in imports | Oak (HTTP middleware) |
| `hono` in imports | Hono |

### Bun

| Indicator | Framework |
|---|---|
| `bun.lockb` exists | Bun runtime |
| `elysia` in deps | Elysia (Bun web framework) |
| `hono` in deps | Hono |

### Python

| Indicator | Framework |
|---|---|
| `django` in deps | Django |
| `flask` in deps | Flask |
| `fastapi` in deps | FastAPI |
| `starlette` in deps | Starlette |
| `celery` in deps | Celery (task queue) |
| `sqlalchemy` in deps | SQLAlchemy (ORM) |
| `pydantic` in deps | Pydantic |
| `torch`, `tensorflow` | ML framework |
| `langchain`, `llama-index` | LLM framework |

### Go

| Indicator | Framework |
|---|---|
| `gin-gonic/gin` | Gin |
| `gofiber/fiber` | Fiber |
| `labstack/echo` | Echo |
| `gorilla/mux` | Gorilla Mux |
| `go-chi/chi` | Chi |
| `gorm.io/gorm` | GORM (ORM) |
| `ent/ent` | Ent (ORM) |

### Rust

| Indicator | Framework |
|---|---|
| `actix-web` | Actix Web |
| `axum` | Axum |
| `rocket` | Rocket |
| `tokio` | Tokio (async runtime) |
| `diesel` | Diesel (ORM) |
| `sea-orm` | SeaORM |
| `clap` | Clap (CLI) |
| `tauri` | Tauri (desktop) |

### Java / Kotlin

| Indicator | Framework |
|---|---|
| `spring-boot` | Spring Boot |
| `quarkus` | Quarkus |
| `micronaut` | Micronaut |
| `ktor` | Ktor |
| `hibernate` | Hibernate (ORM) |

## Infrastructure Detection

| File / Pattern | Technology |
|---|---|
| `Dockerfile`, `docker-compose.yml` | Docker |
| `k8s/`, `kubernetes/`, `helm/` | Kubernetes |
| `terraform/`, `*.tf` | Terraform |
| `.github/workflows/` | GitHub Actions |
| `.gitlab-ci.yml` | GitLab CI |
| `Jenkinsfile` | Jenkins |
| `.circleci/` | CircleCI |
| `serverless.yml` | Serverless Framework |
| `vercel.json` | Vercel |
| `netlify.toml` | Netlify |
| `fly.toml` | Fly.io |
| `railway.json` | Railway |

## Database Detection

Search config files and dependency manifests for:

| Indicator | Database |
|---|---|
| `postgres`, `pg` | PostgreSQL |
| `mysql`, `mysql2` | MySQL |
| `mongodb`, `mongoose` | MongoDB |
| `redis`, `ioredis` | Redis |
| `sqlite` | SQLite |
| `elasticsearch` | Elasticsearch |
| `prisma` | Prisma (ORM, check `schema.prisma` for DB) |
| `drizzle` | Drizzle ORM |
| `typeorm` | TypeORM |
| `sequelize` | Sequelize |
| `knex` | Knex.js (query builder) |

## Message Queue / Event Detection

| Indicator | Technology |
|---|---|
| `amqplib`, `rabbitmq` | RabbitMQ |
| `kafkajs`, `kafka` | Kafka |
| `bullmq`, `bull` | Bull (Redis queue) |
| `nats` | NATS |
| `aws-sdk` + SQS | AWS SQS |
| `@google-cloud/pubsub` | Google Pub/Sub |

## Auth Detection

| Indicator | Technology |
|---|---|
| `passport` | Passport.js |
| `next-auth`, `@auth/core` | Auth.js |
| `jsonwebtoken`, `jose` | JWT |
| `@clerk` | Clerk |
| `@supabase/auth` | Supabase Auth |
| `firebase-admin` + auth | Firebase Auth |
| `oauth2`, `openid` | OAuth2 / OIDC |
| `keycloak` | Keycloak |

## Build Tool Detection

| Indicator | Tool |
|---|---|
| `vite.config.*` | Vite |
| `webpack.config.*` | Webpack |
| `esbuild` in deps | esbuild |
| `turbo.json` | Turborepo |
| `nx.json` | Nx |
| `lerna.json` | Lerna |
| `pnpm-workspace.yaml` | pnpm workspaces |
| `bun.lockb` | Bun |
| `deno.lock` | Deno |
