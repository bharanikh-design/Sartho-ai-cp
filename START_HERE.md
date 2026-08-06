# Start here

`bharanikh-design/Sartho-ai-cp` is the Codex working repository for Sartho.
Claude's `bharanikh-design/sartho-ai` repository is retained as the upstream
reference and must not be used as the Codex push target.

## First local run

1. Use Node.js 24 LTS.
2. Install the locked dependency set with `npm ci`.
3. Copy `.env.example` to `.env.local` and configure Supabase plus at least one
   server-side AI provider.
4. Apply the migrations in `supabase/migrations` to the intended Supabase
   project.
5. Run `npm run dev` and open `http://localhost:3000`.

## Current baseline

The application includes Supabase authentication, private career evidence,
job analysis, application tracking, résumé import and drafting, provider
diagnostics, and Row Level Security migrations. Generated claims must remain
traceable to approved evidence.

## Before deployment

Run these checks from a clean checkout:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The production build requires the public Supabase URL and publishable key.
Before sharing a deployment, verify authentication redirects, Row Level
Security, private storage, migrations, and each configured AI provider against
the intended production services.
