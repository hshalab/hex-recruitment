-- Audit U7: employer_email_templates had RLS enabled with zero policies, so
-- the settings/email-templates UI couldn't read or write anything. Service-role
-- reads (lib/customEmailTemplate.ts) bypass RLS and were unaffected; the gap
-- was purely on the authenticated-client side.
--
-- Each policy is gated on auth.uid() = employer_id so an employer can only
-- ever see or mutate their own templates.

CREATE POLICY "employer_email_templates_select_own"
  ON public.employer_email_templates
  FOR SELECT
  TO authenticated
  USING (auth.uid() = employer_id);

CREATE POLICY "employer_email_templates_insert_own"
  ON public.employer_email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "employer_email_templates_update_own"
  ON public.employer_email_templates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = employer_id)
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "employer_email_templates_delete_own"
  ON public.employer_email_templates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = employer_id);
