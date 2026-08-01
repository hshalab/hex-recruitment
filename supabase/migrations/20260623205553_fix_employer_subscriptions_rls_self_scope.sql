-- Security fix: the "Service role can manage subscriptions" policy was created
-- TO public with USING(true)/WITH CHECK(true), letting ANY signed-in user
-- read/modify/delete every employer's subscription row. service_role bypasses
-- RLS anyway, so the policy granted nothing to the service role and everything
-- to everyone else. Replace it with a self-scoped policy so a user can only
-- touch their OWN subscription row. Server-side service-role writes (Stripe
-- webhook, trial setup/activate, cron, admin, foundingSignup) are unaffected
-- (they bypass RLS). The existing "Users can view own subscription" SELECT
-- policy is left intact. Client self-writes (settings/subscription cancel +
-- resume) remain allowed because they operate on the user's own row.
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.employer_subscriptions;

CREATE POLICY "Users manage own subscription" ON public.employer_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
