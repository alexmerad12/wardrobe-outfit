-- ============================================
-- Closette — Database Schema
-- Safe to re-run: uses drop-if-exists.
-- Run this in your Supabase SQL Editor (Project → SQL Editor → New query).
-- ============================================

create extension if not exists "uuid-ossp";

-- ============================================
-- Clothing Items
-- ============================================
drop table if exists clothing_items cascade;
create table clothing_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  image_url text not null,
  thumbnail_url text,
  name text not null,
  category text not null check (category in ('top','bottom','dress','one-piece','outerwear','shoes','bag','accessory')),
  subcategory text,

  colors jsonb default '[]'::jsonb,
  dominant_color_hsl jsonb,
  is_neutral boolean default false,

  neckline text,
  sleeve_length text,
  closure text,

  -- These can be stored as a single string or array. JSONB preserves either.
  pattern jsonb default '"solid"'::jsonb,
  material jsonb default '"cotton"'::jsonb,
  formality jsonb default '"casual"'::jsonb,

  fit text,
  bottom_fit text,
  length text,
  pants_length text,
  waist_style text,
  waist_height text,
  waist_closure text,
  belt_compatible boolean default false,
  belt_position text,
  is_layering_piece boolean default false,
  shoe_height text,
  heel_type text,
  shoe_closure text,
  belt_style text,
  metal_finish text,

  seasons text[] default '{}'::text[],
  occasions text[] default '{}'::text[],
  warmth_rating numeric(3, 1) default 3 check (warmth_rating between 1 and 5),
  rain_appropriate boolean default false,
  brand text,

  times_worn integer default 0,
  last_worn_date date,
  is_favorite boolean default false,
  is_stored boolean default false,
  created_at timestamptz default now()
);

create index clothing_items_user_idx on clothing_items (user_id);
create index clothing_items_user_category_idx on clothing_items (user_id, category);

-- ============================================
-- Outfits
-- ============================================
drop table if exists outfits cascade;
create table outfits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text,
  item_ids uuid[] default '{}'::uuid[],
  occasions text[] default '{}'::text[],
  seasons text[] default '{}'::text[],
  rating integer check (rating between 1 and 5),
  is_favorite boolean default false,
  mood text,
  weather_temp numeric,
  weather_condition text,
  ai_reasoning text,
  styling_tip text,
  source text default 'manual' check (source in ('ai','manual')),
  created_at timestamptz default now()
);

create index outfits_user_idx on outfits (user_id);

-- ============================================
-- Outfit Log (calendar / wear history)
-- ============================================
drop table if exists outfit_log cascade;
create table outfit_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  outfit_id uuid references outfits(id) on delete set null,
  worn_date date not null,
  weather_snapshot jsonb,
  mood text,
  occasion text,
  loved_it boolean default false,
  notes text,
  created_at timestamptz default now()
);

create index outfit_log_user_date_idx on outfit_log (user_id, worn_date desc);

-- ============================================
-- Today's outfit (exactly one row per user)
-- ============================================
drop table if exists today_outfit cascade;
create table today_outfit (
  user_id uuid primary key references auth.users(id) on delete cascade,
  outfit_id uuid,
  item_ids uuid[] default '{}'::uuid[],
  name text,
  reasoning text,
  styling_tip text,
  mood text,
  occasion text,
  weather_temp numeric,
  weather_condition text,
  is_favorite boolean default false,
  date date not null,
  updated_at timestamptz default now()
);

-- ============================================
-- Recent outfits (rolling history per user)
-- ============================================
drop table if exists recent_outfits cascade;
create table recent_outfits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  outfit_id uuid,
  item_ids uuid[] default '{}'::uuid[],
  name text,
  reasoning text,
  styling_tip text,
  mood text,
  occasion text,
  weather_temp numeric,
  weather_condition text,
  is_favorite boolean default false,
  date date not null,
  created_at timestamptz default now()
);

create index recent_outfits_user_date_idx on recent_outfits (user_id, date desc);

-- ============================================
-- Trips (packing plans)
-- ============================================
drop table if exists trips cascade;
create table trips (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  destination text not null,
  lat numeric,
  lng numeric,
  start_date date not null,
  end_date date not null,
  occasions text,
  notes text,
  packing_item_ids uuid[] default '{}'::uuid[],
  weather_summary text,
  packing_tips text,
  outfit_suggestions jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index trips_user_start_idx on trips (user_id, start_date desc);

-- ============================================
-- User Preferences
-- ============================================
drop table if exists user_preferences cascade;
create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location jsonb,
  temperature_sensitivity text default 'normal' check (temperature_sensitivity in ('runs-hot','normal','runs-cold')),
  temperature_unit text default 'auto' check (temperature_unit in ('auto','celsius','fahrenheit')),
  language text default 'auto' check (language in ('auto','en','fr')),
  gender text default 'not-specified' check (gender in ('woman','man','not-specified')),
  preferred_styles text[] default '{}'::text[],
  favorite_colors text[] default '{}'::text[],
  avoided_colors text[] default '{}'::text[]
);

-- ============================================
-- Subscriptions (stub for future billing integration)
-- ============================================
drop table if exists subscriptions cascade;
create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text default 'none' check (status in ('none','trialing','active','past_due','canceled')),
  plan text,
  platform text check (platform in ('stripe','app_store','play_store')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- Row Level Security — users can only touch their own rows
-- ============================================
alter table clothing_items enable row level security;
alter table outfits enable row level security;
alter table outfit_log enable row level security;
alter table today_outfit enable row level security;
alter table recent_outfits enable row level security;
alter table trips enable row level security;
alter table user_preferences enable row level security;
alter table subscriptions enable row level security;

create policy "own items select" on clothing_items for select using (auth.uid() = user_id);
create policy "own items insert" on clothing_items for insert with check (auth.uid() = user_id);
create policy "own items update" on clothing_items for update using (auth.uid() = user_id);
create policy "own items delete" on clothing_items for delete using (auth.uid() = user_id);

create policy "own outfits select" on outfits for select using (auth.uid() = user_id);
create policy "own outfits insert" on outfits for insert with check (auth.uid() = user_id);
create policy "own outfits update" on outfits for update using (auth.uid() = user_id);
create policy "own outfits delete" on outfits for delete using (auth.uid() = user_id);

create policy "own logs select" on outfit_log for select using (auth.uid() = user_id);
create policy "own logs insert" on outfit_log for insert with check (auth.uid() = user_id);
create policy "own logs update" on outfit_log for update using (auth.uid() = user_id);
create policy "own logs delete" on outfit_log for delete using (auth.uid() = user_id);

create policy "own today select" on today_outfit for select using (auth.uid() = user_id);
create policy "own today insert" on today_outfit for insert with check (auth.uid() = user_id);
create policy "own today update" on today_outfit for update using (auth.uid() = user_id);
create policy "own today delete" on today_outfit for delete using (auth.uid() = user_id);

create policy "own recent select" on recent_outfits for select using (auth.uid() = user_id);
create policy "own recent insert" on recent_outfits for insert with check (auth.uid() = user_id);
create policy "own recent update" on recent_outfits for update using (auth.uid() = user_id);
create policy "own recent delete" on recent_outfits for delete using (auth.uid() = user_id);

create policy "own trips select" on trips for select using (auth.uid() = user_id);
create policy "own trips insert" on trips for insert with check (auth.uid() = user_id);
create policy "own trips update" on trips for update using (auth.uid() = user_id);
create policy "own trips delete" on trips for delete using (auth.uid() = user_id);

create policy "own prefs select" on user_preferences for select using (auth.uid() = user_id);
create policy "own prefs insert" on user_preferences for insert with check (auth.uid() = user_id);
create policy "own prefs update" on user_preferences for update using (auth.uid() = user_id);

create policy "own subscription select" on subscriptions for select using (auth.uid() = user_id);

-- ============================================
-- Storage bucket for clothing images
-- ============================================
insert into storage.buckets (id, name, public)
values ('clothing-images', 'clothing-images', true)
on conflict (id) do nothing;

-- Storage policies — files live under `${userId}/...`
drop policy if exists "upload own images" on storage.objects;
drop policy if exists "delete own images" on storage.objects;
drop policy if exists "update own images" on storage.objects;
drop policy if exists "public read images" on storage.objects;

create policy "upload own images" on storage.objects for insert
  with check (bucket_id = 'clothing-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "delete own images" on storage.objects for delete
  using (bucket_id = 'clothing-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "update own images" on storage.objects for update
  using (bucket_id = 'clothing-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "public read images" on storage.objects for select
  using (bucket_id = 'clothing-images');
