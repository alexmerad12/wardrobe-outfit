-- Add 'refine' to the ai_calls feature check constraint so refine
-- telemetry stops piggybacking on 'suggest'.
--
-- NOT YET APPLIED. After running this in the Supabase SQL editor, flip
-- DB_FEATURE.refine to "refine" in src/lib/log-ai-call.ts. Historical
-- refine rows remain feature='suggest' with metadata->>'kind' = 'refine';
-- query with: feature = 'refine' OR (feature = 'suggest' AND metadata->>'kind' = 'refine').

alter table ai_calls drop constraint if exists ai_calls_feature_check;
alter table ai_calls add constraint ai_calls_feature_check
  check (feature in ('suggest', 'refine', 'try_on', 'packing', 'analyze_item'));
