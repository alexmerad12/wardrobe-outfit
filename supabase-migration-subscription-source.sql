-- user_subscriptions: where the subscription was bought.
--
-- Until 2026-11-13 Stripe was the only seller. The Android app sells the
-- same subscription through Google Play (Google forbids any other payment
-- inside an app), with RevenueCat in between. One row per user stays the
-- rule: `source` says which seller owns it, and each writer leaves a row
-- of the other seller alone unless its own subscription grants access
-- (src/lib/play-billing.ts, mayOverwrite).
--
--   source            'stripe' (linette.app) or 'play' (the Android app)
--   store_product_id  Google Play's product, "<subscription>:<base plan>",
--                     kept for support; null on Stripe rows
--
-- Additive and safe to apply before the code that reads it: existing rows
-- and the Stripe webhook's upserts get 'stripe' from the default.

alter table public.user_subscriptions
  add column if not exists source text not null default 'stripe';

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_source_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_source_check
  check (source in ('stripe', 'play'));

alter table public.user_subscriptions
  add column if not exists store_product_id text;
