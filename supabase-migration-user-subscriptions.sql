-- user_subscriptions: source of truth for Linette paid access.
--
-- The Stripe webhook (/api/stripe/webhook) is the only writer; reads
-- happen in middleware (paywall gate) and in /profile/settings/billing.
-- The unique constraint on user_id means one active subscription per
-- user; if Stripe ever sends a second subscription (e.g. user upgrades
-- weekly → annual without cancelling first) the webhook upserts and
-- the latest one wins.
--
-- Status values mirror Stripe's subscription.status enum. Only
-- 'trialing' and 'active' grant access — past_due is treated as
-- expired so the user gets re-prompted to fix payment before continuing.

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text check (plan in ('weekly', 'annual')),
  status text not null check (status in (
    'trialing', 'active', 'past_due', 'canceled',
    'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  )),
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_user_id_idx
  on public.user_subscriptions (user_id);
create index if not exists user_subscriptions_stripe_customer_id_idx
  on public.user_subscriptions (stripe_customer_id);
create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions (status);

-- RLS — users read their own row; only the service role writes.
-- The webhook uses the service role (it doesn't have a user context),
-- so all upserts/updates land via SUPABASE_SECRET_KEY, not via the
-- user's session.
alter table public.user_subscriptions enable row level security;

drop policy if exists "user reads own subscription"
  on public.user_subscriptions;
create policy "user reads own subscription"
  on public.user_subscriptions
  for select
  using (auth.uid() = user_id);

-- updated_at autotouch
create or replace function public.touch_user_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_subscriptions_touch_updated_at
  on public.user_subscriptions;
create trigger user_subscriptions_touch_updated_at
  before update on public.user_subscriptions
  for each row execute function public.touch_user_subscriptions_updated_at();
