-- ai_calls insert policy: users may only log their OWN calls.
--
-- The original policy ("service role can insert", WITH CHECK (true), role
-- public) let any client, even an anonymous one holding the public key,
-- insert telemetry rows under any user_id. The service role bypasses RLS
-- and never needed a policy; the app logs through the signed-in user's own
-- client (src/lib/log-ai-call.ts), where auth.uid() = user_id holds.
-- Applied to production 2026-10-15.

drop policy if exists "service role can insert" on public.ai_calls;

create policy "users insert their own ai calls"
  on public.ai_calls
  for insert
  to authenticated
  with check (auth.uid() = user_id);
