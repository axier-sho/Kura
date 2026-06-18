-- ----------------------------------------------------------------------------
-- Per-user AI settings (BYOK)
--
-- Kura ships no shared Gemini key: each user supplies their own and picks their
-- primary / escalation models. This table is the source of truth; the env
-- GEMINI_* vars are only a self-host/dev fallback. The API key is encrypted at
-- rest by the app (lib/crypto.ts) when KURA_ENCRYPTION_KEY is set.
-- ----------------------------------------------------------------------------
create table if not exists public.user_ai_settings (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  gemini_api_key          text,          -- nullable; opaque ciphertext (or plaintext if no enc key)
  gemini_model            text,          -- null → fall back to env default
  gemini_model_escalation text,          -- null → fall back to env default
  updated_at              timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;

-- A user can read/write only their own row (mirrors profiles_rw in 0001).
drop policy if exists user_ai_settings_rw on public.user_ai_settings;
create policy user_ai_settings_rw on public.user_ai_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
