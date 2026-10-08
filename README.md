# Adrian Ding Portal

Internal dashboard shell. TanStack Start (frontend + server in one app), Better Auth with Google sign-in, Drizzle + Postgres, shadcn/ui.

Only allowlisted emails can sign in. Manage the list on the **Settings** page.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm db:migrate
pnpm dev               # http://localhost:3000
```

### Google OAuth

1. Create an OAuth client (type "Web application") at https://console.cloud.google.com/apis/credentials
2. Add the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`, e.g. `http://localhost:3000/api/auth/callback/google`
3. Put the client ID and secret in `.env`

### First user

Nobody is on the allowlist at first. Put your email in `ADMIN_EMAILS` (comma-separated), sign in, then add everyone else from Settings. Emails in `ADMIN_EMAILS` are always allowed and can't be removed from the UI.

### Image uploads (Cloudflare R2)

1. Create an R2 bucket and turn on public access (a custom domain or the `r2.dev` URL)
2. Create an R2 API token with "Object Read & Write" on that bucket
3. Fill the `R2_*` values in `.env`
4. Add this CORS rule to the bucket (R2 > bucket > Settings > CORS policy), with your portal URLs:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://<portal-domain>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

The browser uploads files straight to R2 with a short-lived signed URL. The app starts without the `R2_*` values, but uploads fail until they are set.

## Database

- Schema: `src/db/schema/` (one file per area, re-exported from `index.ts`)
- After changing it: `pnpm db:generate`, then `pnpm db:migrate`

## Public API

The public website reads CMS content from `/api/public/*`.
It is read-only, needs no sign-in and returns published content only.

```bash
curl "http://localhost:3000/api/public/workshops?upcoming=true"
```

See [docs/public-api.md](docs/public-api.md) for every endpoint, its params, its response type and an example response.

## Deploy

Set the same env vars as `.env` on the host. `BETTER_AUTH_URL` must be the public URL, and the Google redirect URI must match it.

**Cloudflare Workers** (main target):

```bash
pnpm deploy:cf   # builds with the cloudflare_module preset, then runs wrangler deploy
```

Add the env vars as Worker secrets, e.g. `npx wrangler secret put DATABASE_URL`. The database has to be reachable from the internet.

With Workers Builds (Git integration), use build command `pnpm build:cf` and deploy command `npx wrangler deploy`.

**Vercel**: import the repo. Nitro detects Vercel automatically.

## Adding pages

1. Add a route file in `src/routes/_app/` (everything in there requires sign-in)
2. Add it to `NAV_ITEMS` in `src/components/app-sidebar.tsx`

Add shadcn components with `pnpm dlx shadcn@latest add <name>`.
