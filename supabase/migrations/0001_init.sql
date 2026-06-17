-- ============================================================================
-- Kura — initial schema
--
-- Multi-tenant from day one: every table carries org_id and is protected by
-- Row Level Security scoped to the caller's organization (spec §5).
--
-- NOTE: the embedding column is vector(768). This MUST match GEMINI_EMBEDDING_DIM
-- in your env. If you change the embedding dimension, change it here too.
-- ============================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tenancy
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id     uuid not null references auth.users (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  role        text not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- Resolve the caller's org for RLS. SECURITY DEFINER so it can read memberships
-- regardless of the (recursive) policies on that table.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.memberships where user_id = auth.uid() limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Collections (generic top-level grouping; spec's 物件, generalized)
-- ----------------------------------------------------------------------------
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists collections_org_idx on public.collections (org_id);

-- ----------------------------------------------------------------------------
-- Documents
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  collection_id     uuid references public.collections (id) on delete set null,
  content_hash      text not null,                 -- SHA-256, cache/dedupe key (spec §3)
  doc_type          text,
  title             text,
  extracted_fields  jsonb not null default '{}'::jsonb,
  keywords          text[] not null default '{}',
  embedding         vector(768),                   -- semantic search (spec: pgvector)
  confidence        real,
  model             text,                          -- which model produced this
  prompt_version    text,                          -- selective re-run support (spec §3)
  status            text not null default 'needs_review'
                      check (status in ('pending','needs_review','confirmed')),
  storage_path      text,                          -- path in the storage bucket
  original_filename text,
  mime_type         text,
  is_stub           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, content_hash, prompt_version)    -- same content+prompt = cache hit
);
create index if not exists documents_org_idx on public.documents (org_id);
create index if not exists documents_collection_idx on public.documents (collection_id);
create index if not exists documents_status_idx on public.documents (org_id, status);
-- Approximate nearest-neighbour index for cosine distance.
create index if not exists documents_embedding_idx
  on public.documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ----------------------------------------------------------------------------
-- Events (due dates that drive the calendar / notifications; spec §6)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  document_id       uuid references public.documents (id) on delete cascade,
  collection_id     uuid references public.collections (id) on delete set null,
  event_type        text not null,
  due_date          date,
  notify_lead_days  int not null default 14,
  action_needed     text,
  status            text not null default 'open'
                      check (status in ('open','done','dismissed')),
  notified_at       timestamptz,
  generated_doc_id  uuid references public.documents (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists events_org_idx on public.events (org_id);
create index if not exists events_due_idx on public.events (org_id, due_date);

-- ----------------------------------------------------------------------------
-- Templates (draft generation; spec §7)
-- ----------------------------------------------------------------------------
create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  doc_type    text,
  body        text not null default '',   -- placeholders like {{ 当事者名 }}
  version     int not null default 1,
  created_at  timestamptz not null default now()
);
create index if not exists templates_org_idx on public.templates (org_id);

-- ----------------------------------------------------------------------------
-- updated_at trigger for documents
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- New-user bootstrap: create an org + profile + membership on signup.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (name)
  values (coalesce(new.raw_user_meta_data->>'org_name', 'マイ組織'))
  returning id into new_org_id;

  insert into public.profiles (id, email, org_id)
  values (new.id, new.email, new_org_id);

  insert into public.memberships (user_id, org_id, role)
  values (new.id, new_org_id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Semantic search RPC (spec: pgvector 意味検索). Org-scoped.
-- ----------------------------------------------------------------------------
create or replace function public.match_documents(
  query_embedding   vector(768),
  match_count       int default 10,
  filter_collection uuid default null
)
returns table (
  id            uuid,
  title         text,
  doc_type      text,
  collection_id uuid,
  similarity    float
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.title, d.doc_type, d.collection_id,
         1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where d.org_id = public.current_org_id()
    and d.embedding is not null
    and (filter_collection is null or d.collection_id = filter_collection)
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.memberships   enable row level security;
alter table public.collections   enable row level security;
alter table public.documents     enable row level security;
alter table public.events        enable row level security;
alter table public.templates     enable row level security;

-- organizations: members can see their own org
drop policy if exists org_rw on public.organizations;
create policy org_rw on public.organizations
  for all using (id = public.current_org_id())
  with check (id = public.current_org_id());

-- profiles: a user sees/edits only their own profile row
drop policy if exists profiles_rw on public.profiles;
create policy profiles_rw on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- memberships: a user sees only their own membership rows
drop policy if exists memberships_r on public.memberships;
create policy memberships_r on public.memberships
  for select using (user_id = auth.uid());

-- Generic org-scoped policy for the data tables.
drop policy if exists collections_rw on public.collections;
create policy collections_rw on public.collections
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists documents_rw on public.documents;
create policy documents_rw on public.documents
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists events_rw on public.events;
create policy events_rw on public.events
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists templates_rw on public.templates;
create policy templates_rw on public.templates
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- Storage: private bucket for original files, scoped by org via path prefix
-- (files are stored under "<org_id>/...").
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kura-documents', 'kura-documents', false)
on conflict (id) do nothing;

drop policy if exists kura_storage_rw on storage.objects;
create policy kura_storage_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'kura-documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  )
  with check (
    bucket_id = 'kura-documents'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );
