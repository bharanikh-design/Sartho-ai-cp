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
- Provider-independent server AI adapter for Gemini, Anthropic or OpenAI

## Database setup

The timestamped files in `supabase/migrations` are the reproducible schema for
new and local projects. They must be applied in filename order; do not select a
single migration by hand.

The existing live Sartho project is different: it contains user data created
before Supabase migration tracking was enabled. **Do not run `supabase db push`
against that project yet.** After a verified backup, use the reviewed standalone
package below to add only the missing operational infrastructure:

```text
supabase/reconciliation/20260808_existing_project_reconciliation.sql
```

That package does not register or replay the older migrations. Migration history
must be baselined separately from a read-only pull of the live schema before the
project begins using normal `supabase db push` releases.

Private profile seed files must never be committed. `.gitignore` explicitly excludes them.

## Environment variables

Required:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Configure one active server-side AI provider:

```text
AI_PROVIDER=openai
OPENAI_API_KEY
```

Sartho uses `gpt-5.6-luna` for extraction and `gpt-5.6-terra` for analysis and
drafting by default. A transient failure is retried once within OpenAI; a
model-specific availability failure may use the configured OpenAI fallback.
It never sends career data to another provider automatically.

Extracted résumé text is capped at 120,000 characters before any provider call.
This keeps compressed or malformed documents from creating unexpectedly large
model requests while leaving ample room for a normal long-form CV.

Paid Gemini can be activated deliberately for disaster recovery:

```text
AI_PROVIDER=gemini
GEMINI_API_KEY
GEMINI_DATA_TIER=paid
```

The paid-tier acknowledgement is mandatory because free-tier Gemini data must
not process résumés. Anthropic is also available as an explicit operator choice.
All model overrides are documented in `.env.example`.

Provider diagnostics are operations-only. Grant access by setting the operator's
Supabase `app_metadata.role` to `admin`, or add their Auth user UUID to the
server-side `SARTHO_ADMIN_USER_IDS` allowlist. Health checks contact only the
active provider and are shared for five minutes, so regular account allowance is
not consumed and standby providers are not billed.

## Local setup

1. Install Node.js 24 LTS.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

After configuring a paid OpenAI key, run `npm run check:ai` deliberately to
exercise the redacted Luna extraction and Terra evidence-linking contracts.
Ordinary test runs never contact an AI provider.

## Security boundaries

- `proxy.ts` refreshes Supabase sessions and performs early redirects.
- Every route handler independently verifies the authenticated user.
- Row Level Security scopes profile, evidence, jobs, requirements and applications to their owner.
- Deep-analysis writes are atomic through `replace_job_requirements`.
- Profile deletion and workspace wiping require explicit typed confirmation.
