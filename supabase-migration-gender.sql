-- Add gender column to user_preferences
-- Run this once in Supabase SQL editor.

alter table user_preferences
  add column if not exists gender text default 'not-specified'
    check (gender in ('woman','man','not-specified'));
