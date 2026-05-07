-- Outfit edits log — every saved swap (favorites + wear today) writes
-- one row per item replaced. This is gold-standard feedback: the user
-- deliberately rejected the AI's choice and picked their own in this
-- specific context. Future Phase 2 work feeds these signals back into
-- the suggest prompt as "RECENT CORRECTIONS" so the AI learns the
-- user's style over time.
--
-- Design notes:
--   - One row per swap, not per outfit. If the user swaps shoes AND
--     bag in the same outfit and saves, two rows get inserted.
--   - outfit_id links to the saved outfit row when available; nullable
--     because the outfit could be deleted later and we still want to
--     preserve the signal.
--   - Context fields (occasion / mood / weather / season) are
--     denormalized here so we don't need to JOIN through outfit_logs
--     when feeding signals into the suggest prompt later.
--   - RLS: users see and write only their own edits. Admin reads via
--     service-role from /api/admin (already gated by ADMIN_EMAIL).

begin;

create table if not exists public.outfit_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id uuid references public.outfits(id) on delete set null,
  original_item_id uuid not null references public.clothing_items(id) on delete cascade,
  replacement_item_id uuid not null references public.clothing_items(id) on delete cascade,
  occasion text,
  mood text,
  weather_temp numeric,
  weather_condition text,
  season text,
  saved_via text not null check (saved_via in ('favorite', 'wear_today')),
  created_at timestamptz not null default now()
);

create index if not exists idx_outfit_edits_user_created
  on public.outfit_edits(user_id, created_at desc);
create index if not exists idx_outfit_edits_user_occasion
  on public.outfit_edits(user_id, occasion);

alter table public.outfit_edits enable row level security;

drop policy if exists "users see only their own edits" on public.outfit_edits;
create policy "users see only their own edits"
  on public.outfit_edits for select
  using (auth.uid() = user_id);

drop policy if exists "users insert their own edits" on public.outfit_edits;
create policy "users insert their own edits"
  on public.outfit_edits for insert
  with check (auth.uid() = user_id);

commit;

notify pgrst, 'reload schema';
