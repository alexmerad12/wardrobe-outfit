-- AI call log — one row per AI request (suggest, try-on, packing,
-- analyze_item) so we can answer cost + usage questions over time.
--
-- Design notes:
--   - cost_estimate_cents is a static per-feature estimate, not the
--     actual billed cost. Trends-only — real numbers come from the
--     AI Studio dashboard. Numeric(8,4) gives us 4 decimal precision
--     for sub-cent estimates without overflow risk.
--   - succeeded captures whether the call returned usable output.
--     Useful for spotting Gemini failure rate per feature.
--   - metadata is a free-form jsonb so we can attach feature-specific
--     context (mood, occasion, days-of-trip) without schema churn.
--   - RLS: users can read their own calls; admin reads via service
--     role from the /api/admin/usage route, which bypasses RLS.

begin;

create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('suggest', 'try_on', 'packing', 'analyze_item')),
  cost_estimate_cents numeric(8,4) not null,
  succeeded boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_calls_user_created on public.ai_calls(user_id, created_at desc);
create index if not exists idx_ai_calls_feature_created on public.ai_calls(feature, created_at desc);
create index if not exists idx_ai_calls_created on public.ai_calls(created_at desc);

alter table public.ai_calls enable row level security;

drop policy if exists "users see only their own ai calls" on public.ai_calls;
create policy "users see only their own ai calls"
  on public.ai_calls for select
  using (auth.uid() = user_id);

drop policy if exists "service role can insert" on public.ai_calls;
create policy "service role can insert"
  on public.ai_calls for insert
  with check (true);

commit;

notify pgrst, 'reload schema';
