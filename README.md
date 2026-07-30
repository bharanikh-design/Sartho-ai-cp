# Sartho

**Your career, intelligently guided.**

Sartho is a private, evidence-led career intelligence and application workflow for senior professionals.

## Working product flow

1. Sign in through Supabase Auth.
2. Review the private Career Profile and approve, edit or reject evidence.
3. Paste and analyse a job description using the transparent rule-based first pass.
4. Save the job and preserve its analysis.
5. Move the opportunity through the Applications pipeline.
6. Explicitly run server-side deep analysis against approved evidence only.
7. Review the persisted requirement-to-evidence mapping and honest gaps.
8. Explicitly draft a separate tailored résumé with a complete change log.

## Product guardrails

- Human approval before any external action.
- No automatic application submission or email sending.
- No invented skills, certifications, employers, dates, metrics or responsibilities.
- Only evidence with `approval_status = 'approved'` is sent for deep analysis.
- Every AI-cited evidence ID is validated server-side against the authenticated user’s approved records.
- Résumé drafting uses only approved evidence marked safe for résumé use.
- The original job description and every tailored-résumé change remain preserved.
- AI calls are server-side only; provider keys must never use a `NEXT_PUBLIC_` prefix.

## Technology

- Next.js 16 App Router and TypeScript
- Tailwind CSS
- Supabase PostgreSQL and Auth with Row Level Security
- Vercel deployment
- Provider-independent server AI adapter for OpenAI or Anthropic

## Database setup

The existing foundation schema is in `supabase/schema.sql`.

Apply the current product migration:

```text
supabase/migrations/20260731_work_packages_2_6.sql
```

Private profile seed files must never be committed. `.gitignore` explicitly excludes them.

## Environment variables

Required:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Configure one server-side AI provider:

```text
OPENAI_API_KEY
```

or:

```text
ANTHROPIC_API_KEY
```

Optional model overrides are documented in `.env.example`.

## Local setup

1. Install Node.js 20.9 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

Quality checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Security boundaries

- `proxy.ts` refreshes Supabase sessions and performs early redirects.
- Every route handler independently verifies the authenticated user.
- Row Level Security scopes profile, evidence, jobs, requirements and applications to their owner.
- Deep-analysis writes are atomic through `replace_job_requirements`.
- Profile deletion and workspace wiping require explicit typed confirmation.
