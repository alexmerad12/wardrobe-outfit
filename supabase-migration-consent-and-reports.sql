-- Store-review features (2026-11-09): the 18+ / AI consent gate and the
-- report button on AI output.
--
-- 1. user_preferences.age_confirmed_at / ai_consent_at
--    When the user confirmed being 18 or older (Gemini's API terms require
--    it) and agreed to their photos and wardrobe details being sent to
--    Google Gemini (Apple guideline 5.1.2(i): name the third-party AI and
--    get permission first). Null = not asked yet: the proxy sends the user
--    to /consent and answers the AI endpoints with 403 until both are set.
--    Only /api/consent writes them (not in /api/preferences' writable keys).
--
-- 2. ai_reports
--    One row per "Report" on an AI result (Google Play's AI-Generated
--    Content policy: users must be able to flag offensive AI content
--    without leaving the app). `content` is a snapshot of what the user
--    saw. Users can only insert their own rows; reading happens with the
--    service key (/admin). Deleting the account deletes its reports.
--
-- New tables need explicit grants (Supabase stopped granting them by
-- default on 2026-10-30).

alter table public.user_preferences
  add column if not exists age_confirmed_at timestamptz,
  add column if not exists ai_consent_at timestamptz;

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('suggest', 'refine', 'try_on', 'packing', 'analyze_item')),
  reason text not null check (reason in ('offensive', 'inaccurate', 'other')),
  note text check (note is null or char_length(note) <= 2000),
  content jsonb not null,
  locale text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'actioned')),
  created_at timestamptz not null default now()
);

create index if not exists ai_reports_created_at_idx
  on public.ai_reports (created_at desc);

alter table public.ai_reports enable row level security;

drop policy if exists "users insert their own ai reports" on public.ai_reports;
create policy "users insert their own ai reports"
  on public.ai_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- This project's default privileges still hand new tables to anon and
-- authenticated in full: keep only what the app uses (insert, own rows).
revoke all on public.ai_reports from anon, authenticated;
grant insert on public.ai_reports to authenticated;
grant all on public.ai_reports to service_role;
