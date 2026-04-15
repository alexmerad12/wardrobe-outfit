-- ============================================
-- Wardrobe Outfit App - Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- Clothing Items
-- ============================================
create table clothing_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  image_url text not null,
  thumbnail_url text,
  name text not null,
  category text not null check (category in ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'accessory')),
  subcategory text,
  colors jsonb default '[]'::jsonb,
  dominant_color_hsl jsonb,
  is_neutral boolean default false,
  pattern text default 'solid' check (pattern in ('solid', 'striped', 'plaid', 'floral', 'graphic', 'polka-dot', 'abstract', 'other')),
  material text default 'cotton' check (material in ('cotton', 'denim', 'wool', 'silk', 'polyester', 'leather', 'linen', 'knit', 'satin', 'velvet', 'other')),
  fit text default 'regular' check (fit in ('slim', 'regular', 'loose', 'oversized')),
  formality text default 'casual' check (formality in ('very-casual', 'casual', 'smart-casual', 'business-casual', 'formal')),
  seasons text[] default '{}'::text[],
  occasions text[] default '{}'::text[],
  warmth_rating integer default 3 check (warmth_rating between 1 and 5),
  rain_appropriate boolean default false,
  brand text,
  times_worn integer default 0,
  last_worn_date date,
  is_favorite boolean default false,
  created_at timestamptz default now()
);

-- ============================================
-- Outfits
-- ============================================
create table outfits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text,
  item_ids uuid[] default '{}'::uuid[],
  occasions text[] default '{}'::text[],
  seasons text[] default '{}'::text[],
  rating integer check (rating between 1 and 5),
  is_favorite boolean default false,
  created_at timestamptz default now()
);

-- ============================================
-- Outfit Log (calendar)
-- ============================================
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

-- ============================================
-- User Preferences
-- ============================================
create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  location jsonb,
  temperature_sensitivity text default 'normal' check (temperature_sensitivity in ('runs-hot', 'normal', 'runs-cold')),
  preferred_styles text[] default '{}'::text[],
  favorite_colors text[] default '{}'::text[],
  avoided_colors text[] default '{}'::text[]
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
alter table clothing_items enable row level security;
alter table outfits enable row level security;
alter table outfit_log enable row level security;
alter table user_preferences enable row level security;

-- Users can only access their own data
create policy "Users can view own items" on clothing_items for select using (auth.uid() = user_id);
create policy "Users can insert own items" on clothing_items for insert with check (auth.uid() = user_id);
create policy "Users can update own items" on clothing_items for update using (auth.uid() = user_id);
create policy "Users can delete own items" on clothing_items for delete using (auth.uid() = user_id);

create policy "Users can view own outfits" on outfits for select using (auth.uid() = user_id);
create policy "Users can insert own outfits" on outfits for insert with check (auth.uid() = user_id);
create policy "Users can update own outfits" on outfits for update using (auth.uid() = user_id);
create policy "Users can delete own outfits" on outfits for delete using (auth.uid() = user_id);

create policy "Users can view own logs" on outfit_log for select using (auth.uid() = user_id);
create policy "Users can insert own logs" on outfit_log for insert with check (auth.uid() = user_id);
create policy "Users can update own logs" on outfit_log for update using (auth.uid() = user_id);
create policy "Users can delete own logs" on outfit_log for delete using (auth.uid() = user_id);

create policy "Users can view own preferences" on user_preferences for select using (auth.uid() = user_id);
create policy "Users can upsert own preferences" on user_preferences for insert with check (auth.uid() = user_id);
create policy "Users can update own preferences" on user_preferences for update using (auth.uid() = user_id);

-- ============================================
-- Storage bucket for clothing images
-- ============================================
insert into storage.buckets (id, name, public)
values ('clothing-images', 'clothing-images', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Users can upload own images" on storage.objects for insert
  with check (bucket_id = 'clothing-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access for images
create policy "Public read access" on storage.objects for select
  using (bucket_id = 'clothing-images');

-- Allow users to delete their own images
create policy "Users can delete own images" on storage.objects for delete
  using (bucket_id = 'clothing-images' and auth.uid()::text = (storage.foldername(name))[1]);
