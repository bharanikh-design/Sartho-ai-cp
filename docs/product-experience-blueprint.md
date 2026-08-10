# Sartho product experience blueprint

## Product promise

Sartho is a private, evidence-grounded career copilot. It should help someone
move through one understandable loop:

1. **Know me** — build and confirm a trustworthy Career Profile.
2. **Guide me** — agree the career direction and search brief.
3. **Find and decide** — assess opportunities in a consistent way.
4. **Prepare** — tailor a truthful application and interview plan.
5. **Track and learn** — record outcomes and improve future recommendations.

The interface must never expose database structure, provider mechanics or AI
workloads as if they were user goals.

## Experience principles

1. **One page, one job.** Every screen has one user question and one primary
   action. Secondary controls remain subordinate.
2. **Progress is a handoff, not a scavenger hunt.** Every completed action says
   what changed, what comes next and why.
3. **AI proposes; the person decides.** AI output is always reviewable,
   editable, dismissible and grounded in visible source evidence.
4. **Reveal complexity only when it helps a decision.** Operational detail,
   source libraries, change logs and advanced preferences stay collapsed until
   requested.
5. **Empty states are small and actionable.** No decorative blank canvases or
   oversized cards without a useful next action.
6. **The product tells the truth about its capability.** A saved source list is
   not described as active job discovery. Interview guidance is not described
   as AI-generated until a model-backed feature exists.
7. **One visual language.** Shared headers, cards, buttons, forms, status
   treatments and handoffs are used on every authenticated screen.
8. **Readable before impressive.** Body text is never smaller than 14px;
   metadata is never smaller than 12px; line length and hierarchy matter more
   than oversized display typography.

## Journey model

### Initial setup: four human steps

The current seven-step journey exposes internal processing as separate work.
It should become four user-owned steps:

1. **Add résumé** — upload a source; AI extraction is progress inside this step.
2. **Confirm profile** — review the concise Career Profile and uncertainties.
3. **Choose direction** — review AI career suggestions, choose priorities and
   add basic mobility context.
4. **Set search brief** — confirm locations, work model and sources.

### Recurring career loop

After setup, the stable loop is:

`Opportunities → Decide → Prepare → Apply → Track outcome → Improve guidance`

Résumé tailoring and interview preparation belong to a selected opportunity.
They may have overview workspaces, but their primary entry and return path is
the opportunity/application being prepared.

## Screen contracts

| Screen | One job | Primary action | AI role | Handoff |
| --- | --- | --- | --- | --- |
| Sign in | Enter the private workspace | Sign in | None | Home |
| Home | Orient the user to the single most useful next action | Continue next action | Summarise existing state only when grounded | Current workflow step |
| Journey | Explain setup progress without duplicating the work | Continue current step | Explain why the step improves recommendations | Current setup screen |
| Career Profile — empty | Add the first trusted source | Upload résumé | Extract roles, facts and strengths | Profile review |
| Career Profile — ready | Confirm what Sartho knows | Confirm/correct profile | Surface uncertainty and concise evidence-backed summary | Career Direction |
| Career Direction | Choose plausible future paths | Save selected priorities | Propose direct, adjacent and stretch paths with citations | Search Brief |
| Search Brief | Set the boundaries of a useful search | Save search brief | Suggest locations/sources only when supported; no claim of active discovery | Opportunities |
| Opportunities | Add or review roles worth considering | Analyse a role | Cheap deterministic first pass; model-backed deep analysis only on request | Opportunity detail |
| Opportunity detail | Make one pursue/hold/skip decision | Decide next action | Map requirements, explain fit/gaps and cite evidence | Prepare or return to opportunities |
| Résumé preparation | Create and review a truthful job-specific draft | Generate/review draft | Tailor approved evidence and show change log | Opportunity/application |
| Interview preparation | Prepare role-specific questions and evidence stories | Generate/review preparation plan | Future: question themes and STAR scaffolds grounded in the role and approved evidence | Application |
| Applications | Track real-world stages and next actions | Update status/next action | Summarise changes; future outcome-learning suggestions require approval | Relevant application |
| Diagnostics | Help an authorised operator restore AI service | Resolve provider issue | Provider health only | Return to affected workflow |

## Shared page anatomy

Every authenticated page uses the same vertical rhythm:

1. **Page header** — 11–12px eyebrow, 36–44px title, 15–16px description,
   optional compact status or one secondary action.
2. **Primary workspace** — the decision/action that fulfils the page contract.
3. **Supporting information** — compact sections, lists or disclosures.
4. **Workflow handoff** — confirmation, next step, reason and one primary CTA.

No page invents a new hero, metric strip or header composition.

## Visual system

### Typography

- Product UI, page titles and section headings: Inter/system sans.
- Serif typography is reserved for generated-document previews, not navigation
  or workflow UI.
- Page title: 40px desktop, 32px mobile, 1.08 line height.
- Section title: 24–28px desktop, 22–24px mobile.
- Card/item title: 15–18px.
- Body: 15px with 1.55–1.7 line height.
- Control text: 14px.
- Metadata/eyebrow: 12px minimum.

### Spacing and shape

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Page content gap: 24px.
- Card padding: 24–32px desktop, 18–20px mobile.
- Main card radius: 16px; controls: 10px; pills: 999px.
- One subtle border and one shadow recipe across the product.
- Empty states are content-sized; they do not reserve large fixed heights.

### Actions and status

- One dark-green primary button style.
- One neutral secondary button style.
- Destructive actions use rose only inside explicit confirmation flows.
- Status colours have text labels and never rely on colour alone.
- Icon-only buttons have visible tooltips or accessible labels and a minimum
  40px target.

## AI interaction contract

Every AI feature follows the same six-part pattern:

1. **Input:** what information AI will use.
2. **Action:** an explicit model-backed verb such as “Generate suggestions”.
3. **Progress:** what AI is doing in plain language.
4. **Output:** concise recommendation/draft with confidence or path label.
5. **Grounding:** source evidence and inference boundaries.
6. **Decision:** accept, edit, dismiss, retry or continue manually.

Provider failure never creates permanent page content. It appears as one
recoverable workflow state with retry/manual alternatives.

## AI and ML capability map

### Implemented and model-backed

- résumé extraction into roles and evidence;
- evidence-grounded career direction suggestions;
- job requirement extraction and evidence mapping;
- truthful, job-specific résumé drafting with a change log.

### Implemented without a model

- skill profile construction from approved evidence;
- preliminary job matching and recommendation rules;
- journey readiness and application-stage counts;
- résumé evidence-quality scoring.

### Not implemented and must not be implied

- automated opportunity discovery from selected sources;
- learned ranking from user behaviour or outcomes;
- model-generated interview preparation;
- daily email summaries or notifications;
- automatic application submission.

### Recommended sequence

1. Add model-backed interview preparation grounded in one saved opportunity.
2. Build compliant opportunity ingestion adapters and freshness metadata.
3. Add transparent multi-signal ranking before considering learned ML ranking.
4. Add opt-in daily email summaries from durable opportunity/application data.
5. Introduce outcome-learning suggestions only after enough real outcomes exist,
   and require user approval before changing the search brief.

## Definition of done for the rework

- Four-step setup and one recurring opportunity loop are canonical everywhere.
- Every page uses the shared header, content and handoff components.
- No body or control text is below the minimum readable sizes.
- Empty, loading, success, recoverable-error and populated states are designed
  for every primary workflow.
- Desktop, tablet and mobile handoffs remain visible and usable.
- Keyboard focus, labels, contrast and reduced motion are verified.
- Product copy matches real capability.
- AI outputs remain evidence-grounded and human-controlled.
