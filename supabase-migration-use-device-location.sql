-- user_preferences.use_device_location
--
-- Lets each user choose whether the weather widget asks for browser
-- geolocation (true = follow them wherever they go) or reads weather
-- from their saved city in user_preferences.location (false = stay
-- fixed to home town).
--
-- Default true preserves the existing behavior for users who already
-- have rows in user_preferences before this column existed — they
-- never explicitly opted in to dynamic location but they've been
-- getting it anyway, so we keep them on it.
--
-- Run in: Supabase dashboard → SQL Editor → paste → Run

alter table user_preferences
add column if not exists use_device_location boolean not null default true;
