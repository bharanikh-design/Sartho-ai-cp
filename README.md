# Sartho

**Your career, intelligently guided.**

Sartho is a private, evidence-led career intelligence and application workflow for senior technology professionals. The first user profile is focused on EUC, Digital Workplace, ITSM and ServiceNow transformation leadership.

## What is working in this foundation

- Responsive Next.js application shell.
- Career Truth evidence library seeded from the approved source CVs.
- Transparent target-role strategy and explicit exclusions.
- Working rule-based job screener for role-lane fit and technical heaviness.
- Application-status ledger shell.
- Supabase schema with Row Level Security.

## Product guardrails

- Human approval before any application submission.
- No invented skills, certifications, metrics or responsibilities.
- Avoid ServiceNow developer-heavy and deep technical-architecture roles.
- Prioritise EUC / Digital Workplace / ITSM transformation leadership, followed by ServiceNow engagement and delivery leadership.
- Preserve the original job description and a full change log for every tailored résumé.
- Treat job matching as evidence mapping, not keyword inflation.

## Technology

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth and Storage
- Vercel deployment
- Provider-independent AI layer planned for later phases

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

## Next milestone

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Add Supabase Auth and protect all private routes.
4. Migrate Career Truth seed data into the database.
5. Add approve / edit / reject evidence actions.
6. Add evidence-led AI job matching after Career Truth is validated.

See `docs/product-brief.md` and `docs/architecture.md` for the current decisions.
