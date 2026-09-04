-- Migration: Enable pgvector and create evidence_embeddings table
-- Purpose: Support Semantic Skill Graph and AI matching

-- 1. Enable the vector extension
create extension if not exists vector
with schema extensions;

-- 2. Create the embeddings table
create table if not exists public.evidence_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_id uuid not null references public.evidence_items(id) on delete cascade,
  content text not null,
  -- 1536 is the dimension size for text-embedding-3-small
  embedding vector(1536),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Add an HNSW index for fast similarity search
create index on public.evidence_embeddings using hnsw (embedding vector_cosine_ops);

-- 4. Enable Row Level Security (RLS)
alter table public.evidence_embeddings enable row level security;

create policy "Users can view their own embeddings"
  on public.evidence_embeddings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own embeddings"
  on public.evidence_embeddings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own embeddings"
  on public.evidence_embeddings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own embeddings"
  on public.evidence_embeddings for delete
  using (auth.uid() = user_id);

-- 5. Create a function to search for matching evidence
create or replace function match_evidence (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
returns table (
  id uuid,
  evidence_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    ee.id,
    ee.evidence_id,
    ee.content,
    1 - (ee.embedding <=> query_embedding) as similarity
  from evidence_embeddings ee
  where ee.user_id = p_user_id
    and 1 - (ee.embedding <=> query_embedding) > match_threshold
  order by ee.embedding <=> query_embedding
  limit match_count;
$$;
