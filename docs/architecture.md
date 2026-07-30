# Sartho architecture

## Phase 1

One responsive Next.js application hosted on Vercel, backed by Supabase.

```text
Browser
  │
  ▼
Next.js application
  ├── Career Truth
  ├── Job analyser
  ├── Application package
  └── Application tracker
  │
  ▼
Supabase
  ├── Auth
  ├── PostgreSQL
  └── Private document storage
```

## Data boundaries

- Personal profile and application data remain private per user.
- Row Level Security is mandatory on every user-owned table.
- Service-role credentials must never be exposed to the browser.
- Original job descriptions are immutable evidence inputs; analyses are versioned outputs.
- Uploaded CVs and generated résumés belong in private storage buckets.

## AI boundary

The AI provider is replaceable. The application should call a provider-independent interface that returns validated structured output. Rule-based checks remain in place for technical heaviness, seniority mismatch and prohibited unsupported claims.

## Future components

- Gmail ingestion and outcome classification.
- Proton Mail forwarding into a dedicated Gmail label.
- Browser extension for saving job pages and assisting form completion.
- DOCX/PDF generation with version and change tracking.
- Hiring-manager and recruiter research with source confidence.
