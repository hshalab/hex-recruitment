-- A public bucket for company logos.
--
-- The logo is rendered in the Header, on job cards and on company pages, so it
-- must be publicly readable — which rules out the existing 'profiles' bucket,
-- that one is private and would need signed URLs on every render.
--
-- Until now the company logo was the one image in the product that never went to
-- Storage at all: settings/company drew it onto a canvas and kept the base64
-- data URL, which is how 34KB of PNG ended up inside an auth cookie.
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;
