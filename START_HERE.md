# Start here

The GitHub repository is now the source of truth for Sartho.

## First local run

```bash
git clone https://github.com/bharanikh-design/sartho-ai.git
cd sartho-ai
npm install
npm run dev
```

Open `http://localhost:3000` and test **Analyse a Job** by pasting a complete job description.

## Do not deploy publicly yet

The current Career Truth content is static and the application does not yet have authentication. Create Supabase Auth and verify Row Level Security before connecting Vercel or sharing a deployment URL.

## Next implementation task

Build the Career Truth approval workflow:

- authenticate the user;
- seed evidence into Supabase;
- approve, edit or reject every claim;
- prevent unapproved evidence from being used in generated applications.
