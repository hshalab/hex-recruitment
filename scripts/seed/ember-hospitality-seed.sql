-- =============================================================================
-- Ember Hospitality Group demo seed
-- =============================================================================
-- Date         : 2026-05-10
-- Employer     : 277c20ae-ac3e-4048-9b99-66f41cbf1861
--                pauldavies.gbr+thrivetest8@gmail.com  (auth password TheMunch2017!)
-- Intent       : Replace the previous "ThriveSec Recruitment" cybersec demo
--                seed with hospitality data ahead of the recruiter outreach
--                pivot. 14 jobs across kitchen / FOH / sales / ops, 65 phantom
--                candidate auth users + profiles + applications + 11 interviews.
--
-- Cleanup contract (run before re-seeding from this file):
--   DELETE FROM auth.users WHERE email LIKE 'pauldavies.gbr+demo%@gmail.com';
--     -- cascades to candidate_profiles + job_applications + interviews
--   DELETE FROM public.jobs
--     WHERE employer_id = '277c20ae-ac3e-4048-9b99-66f41cbf1861'
--       AND company = 'Ember Hospitality Group';
--
-- Notes:
--   * salary_type 'annual' on all roles. Tronc / commission / OTE are baked
--     into the JD copy + benefits[] (no dedicated columns in the schema).
--   * All candidates share the password TheMunch2017! and carry
--     raw_user_meta_data.is_simulated:true so a future admin filter can hide
--     them from real-world counts.
--   * 5 applications carry backdated status_updated_at to feed
--     stage-stagnation signal: rows mapped at the bottom of the apps INSERT.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 (reproducible): rename employer + ensure employer_profiles row
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data
                       || jsonb_build_object('company_name', 'Ember Hospitality Group')
WHERE id = '277c20ae-ac3e-4048-9b99-66f41cbf1861';

INSERT INTO public.employer_profiles (
  user_id, company_name, contact_name, email, industry, account_type, is_recruiter
) VALUES (
  '277c20ae-ac3e-4048-9b99-66f41cbf1861',
  'Ember Hospitality Group',
  'Sarah Thompson',
  'pauldavies.gbr+thrivetest8@gmail.com',
  'Hospitality',
  'employer',
  false
) ON CONFLICT (user_id) DO UPDATE
  SET company_name = EXCLUDED.company_name,
      contact_name = EXCLUDED.contact_name,
      email        = EXCLUDED.email,
      industry     = EXCLUDED.industry,
      account_type = EXCLUDED.account_type,
      is_recruiter = EXCLUDED.is_recruiter;


-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4: jobs, candidates, applications, interviews — one transaction
-- ─────────────────────────────────────────────────────────────────────────────

WITH
-- ─── 14 jobs ────────────────────────────────────────────────────────────────
job_data AS (
  SELECT * FROM (VALUES
    ( 1, 'Head Chef', 'Kitchen', 'London', 'Mayfair, W1K', 65000::numeric, 75000::numeric, 'In person',
      E'We''re hiring a Head Chef to lead a 16-strong brigade across two services in our flagship Mayfair restaurant. Brand-new menu launching Q3, lots of room to put your stamp on it. Reports into the Group Executive Chef; full ownership of cost, gross profit, and team development.\n\nMid-week opening hours, no Sunday dinner service. Group is profitable, well-funded, and growing — this isn''t a turnaround.',
      ARRAY['Lead 16-cover brigade across lunch + dinner (avg 220 covers/day)','Own menu development with the Group Exec Chef and source seasonal British produce','Hit GP target of 68% and labour cost 28%','Recruit, train, and develop sous + section chefs','Maintain food safety, allergens, and HACCP standards to 5-star EHO','Build supplier relationships across protein, dairy, and produce']::text[],
      ARRAY['8+ years senior kitchen experience including 2+ as Head Chef or Senior Sous','Experience running modern British / European fine dining at AA Rosette level','Strong cost control and rota management — proven GP and labour ownership','Calm leadership under pressure; demonstrable team retention','Right to work in the UK']::text[],
      ARRAY['£65,000–£75,000 annual','Fully closed Christmas + 28 days holiday','£500/year staff dining allowance','Annual £750 development fund (stages, courses, certs)','Private medical (Vitality)']::text[],
      ARRAY['fine-dining','british','rosette']::text[],
      11),
    ( 2, 'Sous Chef', 'Kitchen', 'London', 'Mayfair, W1K', 42000::numeric, 48000::numeric, 'In person',
      E'Senior Sous Chef position supporting the Head Chef in our Mayfair flagship. You''ll run service, lead a section, and step up as the senior on duty when the Head Chef is off. Modern British menu, seasonal produce, 220 covers/day average.\n\nThis is a development role — we promote from within and the previous Sous Chef just stepped up to Head Chef at our Soho site.',
      ARRAY['Run service across lunch and dinner','Lead one section (sauce, larder, or grill) and own its consistency','Step up as Senior on Duty 2 days/week','Help the Head Chef with rotas, ordering, and stock takes','Train and mentor junior chefs','Cover for Head Chef on annual leave']::text[],
      ARRAY['5+ years kitchen experience including 2+ as Sous Chef or strong CDP','Experience at restaurant Rosette / Bib Gourmand level','Calm during 200+ cover services','Right to work in the UK']::text[],
      ARRAY['£42,000–£48,000 annual','28 days holiday','Staff meals on every shift','Career progression — promote-from-within track record','Career framework and mentoring with the Group Exec Chef']::text[],
      ARRAY['fine-dining','british']::text[],
      9),
    ( 3, 'Pastry Chef', 'Kitchen', 'London', 'Mayfair, W1K', 38000::numeric, 44000::numeric, 'In person',
      E'Pastry Chef leading our dessert and viennoiserie programme across the Mayfair flagship and (from Q4) the new Soho site. Solo or +1 pastry team depending on service. Five-course tasting includes two pastry plates.\n\nLooking for someone with classical technique, a curiosity for modern presentations, and the patience to develop a pastry programme rather than just execute someone else''s.',
      ARRAY['Own the pastry section and dessert menu development','Daily mise en place + service plate-up','Bake bread, viennoiserie, and petit fours','Manage allergens and intolerance plates','Stock-take + ordering for pastry supplies','Train and supervise commis pastry']::text[],
      ARRAY['4+ years pastry experience including 2+ as a Demi or full Pastry Chef','Classical training and confident with chocolate, sugar, ice creams','Calm with multi-component plated desserts','Right to work in the UK']::text[],
      ARRAY['£38,000–£44,000 annual','28 days holiday','Subscription to La Cuisine + monthly dessert R&D budget','Staff meals on every shift']::text[],
      ARRAY['pastry','fine-dining']::text[],
      6),
    ( 4, 'Chef de Partie', 'Kitchen', 'London', 'Shoreditch, E2', 30000::numeric, 36000::numeric, 'In person',
      E'Chef de Partie at our Shoreditch site — neighbourhood European bistro, 90 covers, open kitchen, fresh pasta and grill focus. We''re recruiting one to two CDPs to run sauce or grill section.\n\nThis is a busy site and we move quickly. Looking for someone who can run a section confidently, train a commis, and keep their head during a 200-cover Saturday.',
      ARRAY['Run a section (sauce, grill, or pasta) during service','Own mise en place and section-level stock control','Train and supervise commis chefs','Maintain hygiene + allergens to 5-star EHO standard','Step up to Junior Sous on cover days']::text[],
      ARRAY['2+ years kitchen experience including 1+ year on a section','Experience in European or Italian-leaning kitchens preferred','Calm during 200-cover services','Right to work in the UK']::text[],
      ARRAY['£30,000–£36,000 annual','28 days holiday','Staff meals on every shift','Set hours — closed Sundays + Mondays']::text[],
      ARRAY['bistro','european','italian']::text[],
      4),
    ( 5, 'Restaurant Manager', 'FOH', 'London', 'Soho, W1F', 50000::numeric, 60000::numeric, 'In person',
      E'Restaurant Manager for our Soho neo-bistro. 75 covers, open kitchen, busy late-night cocktail trade. You''ll lead a team of 14 across FOH and bar, run service, manage P&L for the floor, and partner with the Head Chef on operations.\n\nEstablished site, strong covers (avg £58 ASP), regulars, and well-reviewed. Looking for an operator who reads the room and isn''t afraid to push standards.',
      ARRAY['Lead service across lunch, dinner, and late-night drinks','Manage 14-strong FOH + bar team — rotas, training, performance','Own floor P&L: labour, wastage, breakage','Partner with Head Chef on menu changes and 86s','Drive ASP via wine, spirits, and after-dinner programmes','Customer recovery and complaint handling']::text[],
      ARRAY['5+ years senior FOH experience including 2+ as Restaurant Manager','Strong wine knowledge (WSET 2 minimum, 3 preferred)','Track record growing ASP and managing labour to target','Right to work in the UK']::text[],
      ARRAY['£50,000–£60,000 annual','28 days holiday','Performance bonus tied to ASP + Net Promoter','Career framework with monthly 1:1s','Private medical']::text[],
      ARRAY['neo-bistro','soho']::text[],
      14),
    ( 6, 'Assistant Restaurant Manager', 'FOH', 'London', 'Shoreditch, E2', 35000::numeric, 40000::numeric, 'In person',
      E'Assistant Restaurant Manager at our Shoreditch site. 90 covers, busy weekends, pre-theatre crowd Tuesday–Thursday. You''ll run shifts on the days the Restaurant Manager is off, train new starters, and own one operational pillar (e.g. wine list, training, or events).\n\nClear path to Restaurant Manager within 18 months for the right person — both our current Restaurant Managers came up this way.',
      ARRAY['Run service 2–3 days/week as senior on duty','Lead training for new starters across FOH','Own one operational pillar — wine, training, events, or floor standards','Drive cover counts and ASP','Manage daily ops: openings, closings, cash, banking','Step up as Restaurant Manager during cover days']::text[],
      ARRAY['3+ years FOH experience including 1+ as Supervisor or Assistant','Comfortable with 200-cover days','WSET 2 or willingness to do it in first 6 months','Right to work in the UK']::text[],
      ARRAY['£35,000–£40,000 annual','28 days holiday','Quarterly Net Promoter bonus','Funded WSET 2 / 3','Career framework + mentor scheme']::text[],
      ARRAY['neo-bistro','shoreditch']::text[],
      8),
    ( 7, 'Bartender', 'FOH', 'London', 'Soho, W1F', 32000::numeric, 38000::numeric, 'In person',
      E'Senior Bartender at our Soho neo-bistro. Cocktail-led programme — we change the menu quarterly with our own house syrups and tinctures. £32–38k base + tronc (typically £6–8k/year on top).\n\nLooking for someone with classical technique, a curiosity for modern bartending, and the warmth to run service for a regular crowd.',
      ARRAY['Run bar service across lunch, dinner, and late','Mix cocktails to spec and contribute to seasonal menu R&D','Manage stock and orders for spirits, beer, soft, and dry goods','Lead training for new bar starters','Maintain bar cleanliness and hygiene','Build rapport with regulars and guests']::text[],
      ARRAY['3+ years bar experience in a cocktail-led venue','Strong classical cocktail skills','Comfortable with 150+ cover late-night services','Right to work in the UK']::text[],
      ARRAY['£32,000–£38,000 annual base + tronc (avg £6–8k/year)','28 days holiday','Quarterly cocktail menu R&D — your recipes get on the list','Staff meals on every shift']::text[],
      ARRAY['cocktails','soho']::text[],
      3),
    ( 8, 'Waiter / Waitress', 'FOH', 'London', 'Soho, W1F', 28000::numeric, 32000::numeric, 'In person',
      E'Front-of-house at our Soho neo-bistro. Full or part-time. £28–32k base + tronc (typically £5–7k/year on top). Friendly team, structured training, real career path — we promote to Section Lead → Assistant RM internally.\n\nLooking for someone genuinely interested in food and wine, who treats the regulars right and stays cheerful on a 200-cover Saturday.',
      ARRAY['Take orders, serve food and drinks, and clear tables','Build wine and food knowledge to recommend confidently','Run a section of 4–5 tables during service','Maintain floor standards — table set-ups, polishing, cleanliness','Handle payments and end-of-shift cash','Welcome regulars by name']::text[],
      ARRAY['1+ year hospitality experience preferred (we will train the right person without)','Genuine interest in food and wine','Comfortable with busy services','Right to work in the UK']::text[],
      ARRAY['£28,000–£32,000 annual base + tronc (avg £5–7k/year)','28 days holiday','Funded WSET 1 + 2 after probation','Staff meals on every shift','Promote-from-within career path']::text[],
      ARRAY['neo-bistro','soho','part-time-ok']::text[],
      2),
    ( 9, 'Events & Private Dining Sales Manager', 'Sales', 'London', 'Mayfair, W1K', 45000::numeric, 55000::numeric, 'In person',
      E'Events & Private Dining Sales Manager for our Mayfair flagship — 30-cover private dining room, 60-cover terrace, full venue buyout for ~120. Annual events revenue currently £1.4M, target £1.8M for 2026.\n\nThis is a sales role with operational closeness — you''ll lead site visits, build the proposal, run the BEO meeting, and partner with the GM and Head Chef to deliver. Base £45–55k + commission (10% of personally-closed revenue, OTE £75–90k).',
      ARRAY['Lead inbound + outbound events sales pipeline','Run site visits and tasting menus','Own BEO process from booking to delivery handover','Partner with GM + Head Chef on bespoke menu builds','Hit £1.8M revenue target','Build relationships with key corporate accounts and event agents']::text[],
      ARRAY['4+ years events or hospitality sales experience','Track record of personally closing £1M+/year in events revenue','Strong network in London corporate / agency events','WSET 2 minimum (or willingness to acquire)','Right to work in the UK']::text[],
      ARRAY['£45,000–£55,000 annual + commission (10% of revenue, OTE £75–90k)','28 days holiday','Quarterly bonus on team revenue','Private medical','Phone + tech allowance']::text[],
      ARRAY['events','sales','private-dining']::text[],
      18),
    (10, 'Group Sales Executive', 'Sales', 'London', 'Marylebone, W1U', 35000::numeric, 42000::numeric, 'Hybrid',
      E'Group Sales Executive based out of our Marylebone head office, hybrid (3 days/week in office, 2 remote). Inbound qualification + outbound prospecting across all 4 Ember sites.\n\nBase £35–42k + commission (5% of revenue closed, OTE £55–65k). Reports into Group Sales Manager. Strong career path to Account Manager and beyond.',
      ARRAY['Qualify inbound enquiries and route to the right venue','Outbound prospect London corporates and agencies','Own the lead → BEO handover for sites','Maintain CRM (Salesforce) hygiene','Hit personal revenue target of £600k/year','Partner with venue Sales Managers on closes']::text[],
      ARRAY['1+ year sales or fast-paced hospitality FOH','Comfortable with a CRM (we use Salesforce)','Confident on the phone and in person','Right to work in the UK']::text[],
      ARRAY['£35,000–£42,000 annual + commission (5%, OTE £55–65k)','28 days holiday','Hybrid (3 days office in Marylebone)','Quarterly team bonus','Career framework — promote to Account Manager in 18 months']::text[],
      ARRAY['sales','hybrid','group']::text[],
      21),
    (11, 'Corporate Account Manager', 'Sales', 'London', 'Marylebone, W1U', 48000::numeric, 58000::numeric, 'Hybrid',
      E'Corporate Account Manager — own a book of ~30 corporate clients (Big 4, magic circle, FTSE 100) and grow account spend across our 4 sites. Base £48–58k + commission (8% of incremental account revenue, OTE £80–95k). Hybrid, 3 days at the Marylebone HO.\n\nWe''re looking for someone with a current London corporate hospitality book — relationships matter more than tenure here.',
      ARRAY['Manage 30 named corporate accounts','Drive incremental revenue: events, group bookings, gift cards','Quarterly business reviews with each major account','Partner with site GMs on bespoke account proposals','Own renewal + retention metrics','Hit £1.5M annual revenue target']::text[],
      ARRAY['4+ years B2B account management in hospitality / events','Demonstrable London corporate hospitality network','Comfortable with QBRs and proposal writing','Right to work in the UK']::text[],
      ARRAY['£48,000–£58,000 annual + commission (8%, OTE £80–95k)','28 days holiday','Hybrid (3 days in Marylebone HO)','Private medical','Phone + £150/month entertainment budget']::text[],
      ARRAY['sales','accounts','b2b']::text[],
      24),
    (12, 'Operations Manager', 'Operations', 'London', 'Multi-site, EC2A', 55000::numeric, 65000::numeric, 'Hybrid',
      E'Operations Manager covering all 4 Ember sites (Mayfair flagship, Soho neo-bistro, Shoreditch bistro, the new Marylebone wine bar opening Q4). You''ll be the GM''s right hand on rotas, payroll, suppliers, compliance, and store-level P&L.\n\nFloor-up role — you''ll be on-site 4 days/week rotating, 1 day at HO. Reports into the Group Operations Director.',
      ARRAY['Multi-site rota oversight and labour cost discipline','Supplier management — main grocer, drinks, linen, laundry','Compliance: H&S, EHO prep, allergens, data protection','Site-level P&L review with each GM weekly','Onboarding for new GMs / management hires','Cover GM on annual leave at any site']::text[],
      ARRAY['5+ years multi-site hospitality operations','Comfortable with weekly P&L review and root-cause analysis','Strong supplier relationship management','Right to work in the UK']::text[],
      ARRAY['£55,000–£65,000 annual','28 days holiday','Hybrid (4 days site / 1 day HO)','Performance bonus','Private medical','Mileage / travel between sites']::text[],
      ARRAY['ops','multi-site','hybrid']::text[],
      27),
    (13, 'General Manager', 'Operations', 'London', 'Mayfair, W1K', 60000::numeric, 70000::numeric, 'In person',
      E'General Manager for our Mayfair flagship. 220 covers/day average, 30 staff across kitchen + FOH + bar, £6.2M annual revenue. Reports into the Group Operations Director.\n\nFull P&L ownership for the site. We''re looking for an operator who runs a tight floor, develops their team, and treats hospitality as craft.',
      ARRAY['Full P&L ownership for the Mayfair site (£6.2M revenue)','Lead 30-strong team across FOH + bar + kitchen partnership','Own labour, GP, wastage, and operating margin','Drive sales: ASP, cover counts, repeat visits, events spend','Recruit and develop senior team (Restaurant Manager + Sous Chef)','Maintain brand standards and partner with the Group on growth']::text[],
      ARRAY['7+ years senior operations including 3+ as GM at high-volume venue','Demonstrable P&L ownership and operating-margin growth','Strong people leadership and retention','Right to work in the UK']::text[],
      ARRAY['£60,000–£70,000 annual','30 days holiday','Performance bonus on operating margin','Private medical','Equity participation in group expansion']::text[],
      ARRAY['gm','mayfair','flagship']::text[],
      30),
    (14, 'People & Culture Manager', 'Operations', 'London', 'Marylebone, W1U', 45000::numeric, 55000::numeric, 'In person',
      E'People & Culture Manager for the group. 4 sites, ~140 employees, growing to 200 by year-end. You''ll own recruitment, onboarding, performance, and progression — the full lifecycle.\n\nReports into the Group Ops Director. Currently P&C-of-one supported by an external HR partner; you''ll be the in-house P&C voice across the group.',
      ARRAY['Own recruitment across all 4 sites — 60+ hires/year','Design and run onboarding programmes for FOH and kitchen','Lead annual review and progression cycles','Manage employee relations cases with external HR partner','Drive culture initiatives — wellness, diversity, retention','Track and report on attrition, engagement, and time-to-fill']::text[],
      ARRAY['4+ years HR/People generalist experience in hospitality or retail','CIPD level 5 or working towards','Strong employee relations skill','Right to work in the UK']::text[],
      ARRAY['£45,000–£55,000 annual','28 days holiday','CIPD funding','Hybrid encouraged','Wellness budget']::text[],
      ARRAY['people','hr','culture']::text[],
      20)
  ) AS t (job_idx, title, fn, location, area, salary_min, salary_max, work_location,
          description, responsibilities, requirements, benefits, tags, days_ago_posted)
),
inserted_jobs AS (
  INSERT INTO public.jobs (
    employer_id, title, company, location, area, salary_min, salary_max, salary_type,
    employment_type, work_location, views, is_recruiter_posting, status, description,
    responsibilities, requirements, benefits, tags,
    posted_at, expires_at, created_at, updated_at
  )
  SELECT
    '277c20ae-ac3e-4048-9b99-66f41cbf1861'::uuid,
    jd.title,
    'Ember Hospitality Group',
    jd.location,
    jd.area,
    jd.salary_min,
    jd.salary_max,
    'annual',
    ARRAY['full-time']::text[],
    jd.work_location,
    -- Plausible view counts: more views on volume roles + on roles posted longer
    (CASE WHEN jd.fn IN ('FOH','Kitchen') THEN 60 ELSE 30 END + jd.days_ago_posted * 4)::int,
    false,
    'active',
    jd.description,
    jd.responsibilities,
    jd.requirements,
    jd.benefits,
    jd.tags,
    now() - (jd.days_ago_posted || ' days')::interval,
    now() - (jd.days_ago_posted || ' days')::interval + interval '60 days',
    now() - (jd.days_ago_posted || ' days')::interval,
    now() - (jd.days_ago_posted - 1 || ' days')::interval
  FROM job_data jd
  RETURNING id, title
),

-- ─── 65 candidates ──────────────────────────────────────────────────────────
-- Each row: idx, full_name, current_title, current_venue, city, postcode,
--           years_exp, skills array, bio, work_history jsonb, salary_min, salary_max,
--           job_idx (which Ember job they applied to),
--           status, days_ago_created (when profile was created),
--           backdated_status_offset (NULL or specific override),
--           interview_kind (NULL / 'scheduled-future' / 'confirmed-future' / 'completed-past')
candidate_data AS (
  SELECT * FROM (VALUES
    -- ── Job 1: Head Chef (5) ─────────────────────────────────────────────────
    ( 1, 'Andriy Petrov',          'Senior Sous Chef',                   'Hawksmoor Spitalfields',         'London', 'E1 6JJ', 9, ARRAY['Modern British','Cost Control','Brigade Leadership','Allergens','HACCP','Menu Development'],
       'Senior Sous at Hawksmoor for 4 years; ran lunch service solo and stepped up as Head Chef cover for 6 months. Looking to take a Head Chef role and put a stamp on a menu.',
       '[{"role":"Senior Sous Chef","venue":"Hawksmoor Spitalfields","from":"2022-03","to":"present","detail":"22-strong brigade, 240 covers/day average. Owned GP, ordering, and the lunch menu."},{"role":"Sous Chef","venue":"The Wolseley","from":"2019-01","to":"2022-03","detail":"Section work then sous on cold larder. 600 covers/day brasserie."}]'::jsonb,
       65000, 78000,
        1, 'pending',     8, NULL, NULL),
    ( 2, 'Hassan Mansouri',        'Head Chef',                          'Couscous House (independent)',   'London', 'NW6 2AB',11, ARRAY['North African','Modern British','Brigade Leadership','Menu Development','Cost Control','Suppliers'],
       'Head Chef at an independent neighbourhood restaurant for 3 years. 80 covers, full menu ownership. Looking for a step up to a higher-revenue site with more team to develop.',
       '[{"role":"Head Chef","venue":"Couscous House","from":"2023-04","to":"present","detail":"80-cover neighbourhood restaurant. Full menu ownership and team of 8."},{"role":"Senior Sous Chef","venue":"Sketch","from":"2019-09","to":"2023-04","detail":"Tasting menu, 3-Michelin-star prep work."}]'::jsonb,
       70000, 80000,
        1, 'reviewing',   12, NULL, NULL),
    ( 3, 'Yuki Nakamura',          'Senior Sous Chef',                   'Sushisamba Heron Tower',         'London', 'EC2N 4AY',8, ARRAY['Modern British','Asian Fusion','Brigade Leadership','Menu Development','Allergens','Sustainability'],
       'Senior Sous at Sushisamba for 3 years; previously worked under Andrew Wong. Comfortable across Asian-influenced and modern British menus.',
       '[{"role":"Senior Sous Chef","venue":"Sushisamba","from":"2023-01","to":"present","detail":"Senior on duty 3 days/week. 320 covers/day average."},{"role":"Junior Sous","venue":"Andrew Wong","from":"2020-06","to":"2022-12","detail":"Tasting menu, allergen-heavy clientele."}]'::jsonb,
       62000, 75000,
        1, 'shortlisted', 16, NULL, NULL),
    ( 4, 'Chiara Bianchi',         'Head Chef',                          'Petersham Nurseries Cafe',       'London', 'TW10 7AB',12, ARRAY['Italian','Seasonal','Brigade Leadership','Menu Development','Sustainability','Cost Control'],
       'Head Chef at Petersham Nurseries for 2 years; previously sous at Sketch. Italian-leaning with strong seasonal-ingredient bias.',
       '[{"role":"Head Chef","venue":"Petersham Nurseries Cafe","from":"2024-01","to":"present","detail":"Italian-leaning seasonal menu, garden-to-plate. 110-cover lunch service."},{"role":"Senior Sous Chef","venue":"Sketch","from":"2020-04","to":"2023-12","detail":"3-star Michelin work under Pierre Gagnaire team."}]'::jsonb,
       70000, 82000,
        1, 'interview',   18, NULL, 'completed-past'),
    ( 5, 'Krish Pillai',            'Head Chef',                          'Dishoom Carnaby',                'London', 'W1F 9DT',10, ARRAY['Modern Indian','South Indian','Brigade Leadership','Menu Development','Allergens','High Volume'],
       'Head Chef at Dishoom Carnaby for 2 years — opened the site. Strong on volume operations + South Indian technique.',
       '[{"role":"Head Chef","venue":"Dishoom Carnaby","from":"2024-02","to":"present","detail":"Opened site. 350 covers/day. 18-strong brigade."},{"role":"Senior Sous","venue":"Dishoom Shoreditch","from":"2021-04","to":"2024-01","detail":"Senior section work, training and onboarding for new openings."}]'::jsonb,
       72000, 85000,
        1, 'offered',     14, 6, NULL),

    -- ── Job 2: Sous Chef (5) ─────────────────────────────────────────────────
    ( 6, 'Marek Kowalski',         'Sous Chef',                          'Polpo Soho',                     'London', 'W1F 8DG', 7, ARRAY['Italian','Pasta','Brigade Leadership','Menu Development','Cost Control'],
       'Sous Chef at Polpo for 4 years; lead pasta and sauce sections. Looking for senior development.',
       '[{"role":"Sous Chef","venue":"Polpo Soho","from":"2022-02","to":"present","detail":"Lead sections + senior on duty 2 days/week."}]'::jsonb,
       42000, 50000,
        2, 'pending',     5, NULL, NULL),
    ( 7, 'Sofia Rodríguez',        'Sous Chef',                          'Barrafina Adelaide St',           'London', 'WC2N 4HZ', 6, ARRAY['Spanish','Tapas','Brigade Leadership','Allergens','Menu Development'],
       'Sous at Barrafina; experienced under high covers and open-kitchen pressure. Comfortable Spanish-leaning menus.',
       '[{"role":"Sous Chef","venue":"Barrafina","from":"2022-09","to":"present","detail":"Open kitchen, 80 covers, classical Spanish technique."},{"role":"Junior Sous","venue":"Cinco Jotas","from":"2020-01","to":"2022-09","detail":"Spanish charcuterie + tapas."}]'::jsonb,
       42000, 48000,
        2, 'reviewing',   10, NULL, NULL),
    ( 8, 'Emeka Adeyemi',          'Senior Chef de Partie',              'Hide Above',                      'London', 'W1J 7NA', 5, ARRAY['Modern European','Brigade Leadership','Menu Development','Sustainability','Cost Control'],
       'Senior CDP at Hide; ready to step up to Sous. Trained under Ollie Dabbous.',
       '[{"role":"Senior Chef de Partie","venue":"Hide Above","from":"2023-06","to":"present","detail":"Lead sauce section. Tasting menu. Trained under Ollie Dabbous."}]'::jsonb,
       40000, 46000,
        2, 'shortlisted', 14, NULL, NULL),
    ( 9, 'Pavlina Stoyanova',      'Sous Chef',                          'Ottolenghi Spitalfields',         'London', 'E1 6BG', 6, ARRAY['Mediterranean','Vegetarian','Menu Development','Allergens','Brigade Leadership'],
       'Sous at Ottolenghi for 3 years; strong Mediterranean and vegetable-led cooking.',
       '[{"role":"Sous Chef","venue":"Ottolenghi Spitalfields","from":"2023-03","to":"present","detail":"Vegetable-led menu. 200 covers/day average."}]'::jsonb,
       42000, 48000,
        2, 'interview',   16, NULL, 'completed-past'),
    (10, 'Tomás Hernández',        'Sous Chef',                          'Lima Floral',                     'London', 'WC2E 9DD', 7, ARRAY['Peruvian','Latin American','Brigade Leadership','Menu Development','Cost Control'],
       'Sous Chef at Lima Floral for 3 years; ceviche and grill specialist. Open to British / European pivots.',
       '[{"role":"Sous Chef","venue":"Lima Floral","from":"2022-12","to":"present","detail":"Peruvian menu, ceviche + grill sections."}]'::jsonb,
       42000, 48000,
        2, 'offered',     20, NULL, NULL),

    -- ── Job 3: Pastry Chef (4) ───────────────────────────────────────────────
    (11, 'Ji-eun Park',             'Pastry Chef',                       'Le Gavroche',                    'London', 'W1K 7QR', 9, ARRAY['Pastry','Chocolate','Sugar Work','Allergens','Menu Development'],
       'Pastry Chef at Le Gavroche for 4 years; classical French pastry training plus modern plating.',
       '[{"role":"Pastry Chef","venue":"Le Gavroche","from":"2022-06","to":"present","detail":"Classical French pastry + petit fours."},{"role":"Demi Pastry","venue":"The Connaught","from":"2018-03","to":"2022-06","detail":"Petits fours and viennoiserie."}]'::jsonb,
       42000, 52000,
        3, 'pending',      6, NULL, NULL),
    (12, 'Léa Dupont',              'Senior Pastry Chef',                'Pollen Street Social',           'London', 'W1S 1NQ', 8, ARRAY['Pastry','Plated Desserts','Chocolate','Menu Development','Allergens'],
       'Senior Pastry at Pollen Street; specialist in plated desserts and tasting menus.',
       '[{"role":"Senior Pastry Chef","venue":"Pollen Street Social","from":"2023-01","to":"present","detail":"Plated desserts for tasting menu."}]'::jsonb,
       40000, 48000,
        3, 'reviewing',   11, NULL, NULL),
    (13, 'Alessia Romano',          'Pastry Chef',                       'Bocca di Lupo',                  'London', 'W1F 0DX', 7, ARRAY['Italian Pastry','Bread','Pasta','Menu Development','Allergens'],
       'Pastry Chef at Bocca di Lupo; Italian dolci and bread programme. Strong viennoiserie.',
       '[{"role":"Pastry Chef","venue":"Bocca di Lupo","from":"2022-08","to":"present","detail":"Italian dolci, bread, viennoiserie."}]'::jsonb,
       38000, 46000,
        3, 'shortlisted', 13, NULL, NULL),
    (14, 'Beatriz Carvalho',        'Demi Pastry Chef',                  'The Wolseley',                   'London', 'W1J 9EB', 5, ARRAY['Pastry','Viennoiserie','Bread','Allergens','Stock Control'],
       'Demi Pastry at The Wolseley; ready for full Pastry Chef role.',
       '[{"role":"Demi Pastry Chef","venue":"The Wolseley","from":"2023-04","to":"present","detail":"Viennoiserie + petit fours for 600-cover brasserie."}]'::jsonb,
       38000, 44000,
        3, 'interview',   17, NULL, 'confirmed-future'),

    -- ── Job 4: Chef de Partie (8) ────────────────────────────────────────────
    (15, 'Olek Kowalczyk',          'Chef de Partie',                    'Pizza Pilgrims (multi-site)',     'London', 'E2 7BU', 4, ARRAY['Pizza','Italian','Menu Development','Allergens','Stock Control'],
       'CDP at Pizza Pilgrims; pizza and pasta. Looking for a step up at a more ambitious neighbourhood spot.',
       '[{"role":"Chef de Partie","venue":"Pizza Pilgrims","from":"2023-02","to":"present","detail":"Pizza + pasta sections. Multi-site cover."}]'::jsonb,
       30000, 36000,
        4, 'pending',      3, NULL, NULL),
    (16, 'Pranav Agarwal',          'Junior Chef de Partie',             'Gymkhana',                       'London', 'W1S 4AT', 3, ARRAY['Indian','Tandoor','Allergens','Stock Control','Menu Development'],
       'Junior CDP at Gymkhana; tandoor and curry sections. Open to European pivots.',
       '[{"role":"Junior Chef de Partie","venue":"Gymkhana","from":"2024-01","to":"present","detail":"Tandoor + curry sections."}]'::jsonb,
       30000, 34000,
        4, 'pending',      6, NULL, NULL),
    (17, 'Carlos Mendoza',          'Chef de Partie',                    'Lima Floral',                    'London', 'WC2E 9DD', 5, ARRAY['Peruvian','Ceviche','Grill','Menu Development','Allergens'],
       'CDP at Lima Floral; ceviche and grill sections. Latin-American technique with European flexibility.',
       '[{"role":"Chef de Partie","venue":"Lima Floral","from":"2023-05","to":"present","detail":"Ceviche + grill."}]'::jsonb,
       30000, 36000,
        4, 'pending',      9, NULL, NULL),
    (18, 'Nikolai Volkov',          'Chef de Partie',                    'Bob Bob Ricard',                 'London', 'W1F 9HH', 4, ARRAY['Russian','European','Menu Development','Allergens','Stock Control'],
       'CDP at Bob Bob Ricard; cold larder and pastry-adjacent prep.',
       '[{"role":"Chef de Partie","venue":"Bob Bob Ricard","from":"2023-09","to":"present","detail":"Cold larder, prep."}]'::jsonb,
       30000, 36000,
        4, 'pending',     12, NULL, NULL),
    (19, 'Aisha Mwangi',            'Senior Chef de Partie',             'Akoko',                          'London', 'W1S 1JU', 5, ARRAY['West African','Menu Development','Brigade Leadership','Allergens'],
       'Senior CDP at Akoko; West African technique with European training. Looking for a stable European-leaning CDP role.',
       '[{"role":"Senior Chef de Partie","venue":"Akoko","from":"2023-04","to":"present","detail":"West African tasting menu. Lead grill + sauce."}]'::jsonb,
       32000, 38000,
        4, 'reviewing',   13, NULL, NULL),
    (20, 'Tomas Janik',             'Chef de Partie',                    'NoMad London',                   'London', 'WC2H 8DJ', 5, ARRAY['Modern American','European','Menu Development','Allergens','Stock Control'],
       'CDP at NoMad London; sauce section. 4 years experience. Looking for closer-to-home work.',
       '[{"role":"Chef de Partie","venue":"NoMad London","from":"2022-10","to":"present","detail":"Sauce section, 280 covers/day average."}]'::jsonb,
       32000, 38000,
        4, 'shortlisted', 15, 12, NULL),
    (21, 'Wei Xu',                  'Chef de Partie',                    'Hutong (The Shard)',             'London', 'SE1 9RY', 6, ARRAY['Chinese','Cantonese','Brigade Leadership','Wok Section','Allergens'],
       'CDP at Hutong; wok section specialist. Strong Cantonese and Sichuan technique.',
       '[{"role":"Chef de Partie","venue":"Hutong","from":"2022-04","to":"present","detail":"Wok section. 300 covers/day."}]'::jsonb,
       32000, 38000,
        4, 'interview',   17, NULL, 'completed-past'),
    (22, 'Ravi Kumar',              'Junior Chef de Partie',             'Dishoom Kensington',             'London', 'SW7 5LB', 3, ARRAY['Indian','Tandoor','Allergens','Stock Control'],
       'Junior CDP at Dishoom. Tandoor + grill. Looking for European-leaning pivot.',
       '[{"role":"Junior Chef de Partie","venue":"Dishoom Kensington","from":"2024-02","to":"present","detail":"Tandoor and grill sections."}]'::jsonb,
       28000, 32000,
        4, 'rejected',    19, NULL, NULL),

    -- ── Job 5: Restaurant Manager (4) ────────────────────────────────────────
    (23, 'James Thornton',          'Restaurant Manager',                'Hawksmoor Borough',               'London', 'SE1 9DE', 8, ARRAY['Service Leadership','Wine','Cost Control','Training','WSET 3','Brand Standards'],
       'RM at Hawksmoor Borough for 3 years; oversaw site through covers growth. Strong wine and team development.',
       '[{"role":"Restaurant Manager","venue":"Hawksmoor Borough","from":"2023-04","to":"present","detail":"35-strong team, £4.8M revenue. Lifted ASP by £6 in year one."},{"role":"Assistant RM","venue":"Hawksmoor Spitalfields","from":"2020-08","to":"2023-04","detail":"Stepped up through 5 promotions in 3 years."}]'::jsonb,
       55000, 65000,
        5, 'pending',      4, NULL, NULL),
    (24, 'Aleksandra Nowak',        'Restaurant Manager',                'Polpo Brixton',                  'London', 'SW9 8RR', 6, ARRAY['Service Leadership','Wine','Cost Control','Training','WSET 2'],
       'RM at Polpo Brixton; site stable, looking for higher-volume Soho or Mayfair role.',
       '[{"role":"Restaurant Manager","venue":"Polpo Brixton","from":"2023-09","to":"present","detail":"75-cover neighbourhood restaurant."}]'::jsonb,
       50000, 60000,
        5, 'reviewing',    9, NULL, NULL),
    (25, 'Carlos Almeida',          'Senior Assistant Restaurant Manager','The Wolseley',                  'London', 'W1J 9EB', 7, ARRAY['Service Leadership','Wine','Brand Standards','High Volume','WSET 3'],
       'Senior Asst RM at The Wolseley; ready for full RM. Trained under Jeremy King.',
       '[{"role":"Senior Assistant RM","venue":"The Wolseley","from":"2022-04","to":"present","detail":"600-cover brasserie. Senior on duty 4 days/week."}]'::jsonb,
       50000, 58000,
        5, 'shortlisted', 13, NULL, NULL),
    (26, 'Olivia Davies-Cole',      'Restaurant Manager',                'Bocca di Lupo',                  'London', 'W1F 0DX', 6, ARRAY['Service Leadership','Italian Wine','Cost Control','Training','WSET 2'],
       'RM at Bocca di Lupo; Italian wine specialist.',
       '[{"role":"Restaurant Manager","venue":"Bocca di Lupo","from":"2023-08","to":"present","detail":"Italian wine list, 110 covers."}]'::jsonb,
       52000, 60000,
        5, 'interview',   16, 10, 'completed-past'),

    -- ── Job 6: Assistant Restaurant Manager (6) ──────────────────────────────
    (27, 'Daniel Costa',            'Floor Supervisor',                  'Hawksmoor Spitalfields',          'London', 'E1 6JJ', 4, ARRAY['Service Leadership','Wine','Training','Cash Handling'],
       'Floor Supervisor at Hawksmoor; 4 years, ready to step up to Assistant RM.',
       '[{"role":"Floor Supervisor","venue":"Hawksmoor Spitalfields","from":"2022-04","to":"present"}]'::jsonb,
       35000, 40000,
        6, 'pending',      3, NULL, NULL),
    (28, 'Beatrice Romano',         'Senior Waitress',                   'NoMad London',                   'London', 'WC2H 8DJ', 5, ARRAY['Service Leadership','Wine','Training','High Volume','WSET 2'],
       'Senior Waitress at NoMad; full WSET 2, leading sections.',
       '[{"role":"Senior Waitress","venue":"NoMad London","from":"2022-09","to":"present"}]'::jsonb,
       34000, 40000,
        6, 'pending',      6, NULL, NULL),
    (29, 'Tomáš Novák',              'Floor Supervisor',                  'Pizza Pilgrims (Soho)',          'London', 'W1F 8AY', 3, ARRAY['Service Leadership','High Volume','Training'],
       'Floor Supervisor at Pizza Pilgrims; busy site, fast-paced.',
       '[{"role":"Floor Supervisor","venue":"Pizza Pilgrims Soho","from":"2023-04","to":"present"}]'::jsonb,
       32000, 38000,
        6, 'pending',      8, NULL, NULL),
    (30, 'Jasmine Patel',           'Assistant Restaurant Manager',      'Dishoom Carnaby',                 'London', 'W1F 9DT', 5, ARRAY['Service Leadership','Brand Standards','Training','High Volume'],
       'Assistant RM at Dishoom Carnaby; stepped up through Dishoom''s training programme.',
       '[{"role":"Assistant Restaurant Manager","venue":"Dishoom Carnaby","from":"2023-09","to":"present"}]'::jsonb,
       36000, 42000,
        6, 'reviewing',   11, NULL, NULL),
    (31, 'Ade Adesanya',             'Senior Waiter',                     'The Ivy',                        'London', 'WC2N 4DD', 5, ARRAY['Service Leadership','Wine','Training','High Volume','WSET 2'],
       'Senior Waiter at The Ivy; section leader. Looking to step up to Asst RM.',
       '[{"role":"Senior Waiter","venue":"The Ivy","from":"2022-08","to":"present"}]'::jsonb,
       34000, 40000,
        6, 'shortlisted', 14, NULL, NULL),
    (32, 'Sara Lindqvist',          'Assistant Restaurant Manager',       'Sketch (The Lecture Room)',     'London', 'W1S 2XG', 5, ARRAY['Service Leadership','Wine','Brand Standards','WSET 3','Training'],
       'Asst RM at Sketch; fine dining background. Strong service standards.',
       '[{"role":"Assistant RM","venue":"Sketch Lecture Room","from":"2023-01","to":"present"}]'::jsonb,
       38000, 44000,
        6, 'interview',   17, 8, 'confirmed-future'),

    -- ── Job 7: Bartender (8) ─────────────────────────────────────────────────
    (33, 'Lucas Silva',              'Bartender',                         'Tayer + Elementary',             'London', 'EC1V 9HA', 5, ARRAY['Cocktails','Classics','Bar Stock','Training'],
       'Bartender at Tayer + Elementary; cocktail-led, fast late-night programme.',
       '[{"role":"Bartender","venue":"Tayer + Elementary","from":"2022-09","to":"present"}]'::jsonb,
       32000, 38000,
        7, 'pending',      4, NULL, NULL),
    (34, 'Mateusz Wiśniewski',       'Senior Bartender',                  'Bar Termini',                    'London', 'W1F 9SD', 4, ARRAY['Cocktails','Italian Bar','Coffee','Training'],
       'Senior Bartender at Bar Termini; Italian aperitivo specialist.',
       '[{"role":"Senior Bartender","venue":"Bar Termini","from":"2023-02","to":"present"}]'::jsonb,
       33000, 38000,
        7, 'pending',      7, NULL, NULL),
    (35, 'Cassie Jones',             'Bartender',                         'Three Sheets',                   'London', 'E8 4SA', 3, ARRAY['Cocktails','Sustainability','Training'],
       'Bartender at Three Sheets; sustainability-focused cocktail bar.',
       '[{"role":"Bartender","venue":"Three Sheets","from":"2023-06","to":"present"}]'::jsonb,
       32000, 36000,
        7, 'pending',     10, NULL, NULL),
    (36, 'Adriana Costa',            'Bartender',                         'Bibendum Oyster Bar',            'London', 'SW3 6RD', 5, ARRAY['Cocktails','Classics','Wine','Training'],
       'Bartender at Bibendum; classics-led with wine-bar overlap.',
       '[{"role":"Bartender","venue":"Bibendum Oyster Bar","from":"2022-11","to":"present"}]'::jsonb,
       34000, 38000,
        7, 'pending',     12, NULL, NULL),
    (37, 'Diego Fernández',          'Senior Bartender',                  'The Connaught Bar',              'London', 'W1K 2AL', 6, ARRAY['Cocktails','Classics','Training','Mentoring'],
       'Senior Bartender at The Connaught — top-50 bar globally. Looking for a smaller team and creative scope.',
       '[{"role":"Senior Bartender","venue":"The Connaught Bar","from":"2022-04","to":"present"}]'::jsonb,
       36000, 42000,
        7, 'reviewing',   16, NULL, NULL),
    (38, 'Ines Almeida',             'Bartender',                         'NoMad London',                   'London', 'WC2H 8DJ', 4, ARRAY['Cocktails','Hotel Bar','Training','Stock Control'],
       'Bartender at NoMad; hotel-bar pace + classical cocktail programme.',
       '[{"role":"Bartender","venue":"NoMad London","from":"2023-04","to":"present"}]'::jsonb,
       33000, 38000,
        7, 'interview',   18, NULL, 'scheduled-future'),
    (39, 'Jamal Carter',             'Senior Bartender',                  'Lyaness',                        'London', 'SE1 9PD', 5, ARRAY['Cocktails','Modern','Mentoring','Stock Control'],
       'Senior Bartender at Lyaness; Ryan Chetiyawardana''s programme. Modern technique.',
       '[{"role":"Senior Bartender","venue":"Lyaness","from":"2022-12","to":"present"}]'::jsonb,
       36000, 42000,
        7, 'offered',     22, NULL, NULL),
    (40, 'Bruno Duarte',             'Bartender',                         'Sketch (Glade Bar)',             'London', 'W1S 2XG', 4, ARRAY['Cocktails','Modern','Training'],
       'Bartender at Sketch; transitional role, cleared probation but didn''t get on with the programme.',
       '[{"role":"Bartender","venue":"Sketch Glade Bar","from":"2024-02","to":"present"}]'::jsonb,
       30000, 35000,
        7, 'rejected',    25, NULL, NULL),

    -- ── Job 8: Waiter / Waitress (10) ────────────────────────────────────────
    (41, 'Aleksandra Pietrzak',      'Waitress',                          'Polpo Soho',                     'London', 'W1F 8DG', 3, ARRAY['Service','Wine','Training'],
       'Waitress at Polpo Soho. Comfortable with busy Saturday services.',
       '[{"role":"Waitress","venue":"Polpo Soho","from":"2023-09","to":"present"}]'::jsonb,
       28000, 32000,
        8, 'pending',      2, NULL, NULL),
    (42, 'Felipe Santos',            'Senior Waiter',                     'Sushisamba',                     'London', 'EC2N 4AY', 4, ARRAY['Service','Wine','Training','High Volume'],
       'Senior Waiter at Sushisamba; section leader.',
       '[{"role":"Senior Waiter","venue":"Sushisamba","from":"2023-04","to":"present"}]'::jsonb,
       32000, 36000,
        8, 'pending',      4, NULL, NULL),
    (43, 'Anya Kristóf',              'Waitress',                          'Bibendum',                       'London', 'SW3 6RD', 3, ARRAY['Service','Wine','WSET 1'],
       'Waitress at Bibendum; calm, classical-service trained.',
       '[{"role":"Waitress","venue":"Bibendum","from":"2023-11","to":"present"}]'::jsonb,
       28000, 32000,
        8, 'pending',      6, NULL, NULL),
    (44, 'Olu Banjo',                'Senior Waiter',                     'Hawksmoor Knightsbridge',         'London', 'SW1X 7XL', 4, ARRAY['Service','Wine','Training','WSET 2'],
       'Senior Waiter at Hawksmoor; section leader. WSET 2 complete.',
       '[{"role":"Senior Waiter","venue":"Hawksmoor Knightsbridge","from":"2022-08","to":"present"}]'::jsonb,
       30000, 34000,
        8, 'pending',      9, NULL, NULL),
    (45, 'Mei-Lin Chen',              'Waitress',                          'Hutong (The Shard)',             'London', 'SE1 9RY', 3, ARRAY['Service','Languages: Mandarin','Training'],
       'Waitress at Hutong; Mandarin/English speaker, comfortable with corporate clients.',
       '[{"role":"Waitress","venue":"Hutong","from":"2023-12","to":"present"}]'::jsonb,
       28000, 32000,
        8, 'pending',     11, NULL, NULL),
    (46, 'Daniel Romero',             'Waiter',                            'The Ivy',                        'London', 'WC2N 4DD', 2, ARRAY['Service','High Volume','Training'],
       'Waiter at The Ivy; high-volume training. Looking to grow into wine/service expertise.',
       '[{"role":"Waiter","venue":"The Ivy","from":"2024-04","to":"present"}]'::jsonb,
       28000, 32000,
        8, 'reviewing',   17, 14, NULL),
    (47, 'Joana Ferreira',            'Waitress',                          'NoMad London',                   'London', 'WC2H 8DJ', 3, ARRAY['Service','Wine','Languages: Portuguese, Spanish'],
       'Waitress at NoMad. Multi-lingual.',
       '[{"role":"Waitress","venue":"NoMad London","from":"2023-08","to":"present"}]'::jsonb,
       28000, 32000,
        8, 'interview',   19, NULL, 'scheduled-future'),
    (48, 'Pavel Ivanov',              'Senior Waiter',                     'The Wolseley',                   'London', 'W1J 9EB', 5, ARRAY['Service','Wine','Training','High Volume','WSET 2'],
       'Senior Waiter at The Wolseley; section leader. 5 years brasserie service.',
       '[{"role":"Senior Waiter","venue":"The Wolseley","from":"2022-09","to":"present"}]'::jsonb,
       32000, 36000,
        8, 'interview',   22, NULL, 'scheduled-future'),
    (49, 'Charlotte Walsh',           'Senior Waitress',                   'Bocca di Lupo',                  'London', 'W1F 0DX', 4, ARRAY['Service','Italian Wine','Training','WSET 2'],
       'Senior Waitress at Bocca di Lupo; Italian wine specialist.',
       '[{"role":"Senior Waitress","venue":"Bocca di Lupo","from":"2022-12","to":"present"}]'::jsonb,
       30000, 34000,
        8, 'offered',     24, NULL, NULL),
    (50, 'Yusuf Tahir',               'Senior Waiter',                     'NoMad London',                   'London', 'WC2H 8DJ', 5, ARRAY['Service','Wine','Training','High Volume','WSET 2'],
       'Senior Waiter at NoMad; section leader, hired into NoMad''s development pipeline.',
       '[{"role":"Senior Waiter","venue":"NoMad London","from":"2022-08","to":"present"}]'::jsonb,
       32000, 38000,
        8, 'hired',       28, NULL, NULL),

    -- ── Job 9: Events & Private Dining Sales Manager (2) ─────────────────────
    (51, 'Charlotte Hewson-Reid',     'Events Sales Manager',              'The Ned (Soho House Group)',     'London', 'EC2R 8AJ', 6, ARRAY['Events Sales','B2B','BEO','Salesforce','Account Management'],
       'Events Sales Manager at The Ned. Owned £1.6M annual events book; 35 corporate accounts.',
       '[{"role":"Events Sales Manager","venue":"The Ned","from":"2022-09","to":"present","detail":"£1.6M annual events revenue. 35 named accounts. Salesforce."},{"role":"Events Coordinator","venue":"Sketch","from":"2020-04","to":"2022-09"}]'::jsonb,
       50000, 60000,
        9, 'reviewing',   12, NULL, NULL),
    (52, 'Priya Shah',                'Senior Events Coordinator',         'NoMad London',                   'London', 'WC2H 8DJ', 5, ARRAY['Events Sales','B2B','BEO','Account Management','Wine'],
       'Senior Events Coordinator at NoMad; ready to step up to manager.',
       '[{"role":"Senior Events Coordinator","venue":"NoMad London","from":"2022-04","to":"present","detail":"£900k annual events book. 25 accounts."}]'::jsonb,
       45000, 55000,
        9, 'offered',     20, NULL, NULL),

    -- ── Job 10: Group Sales Executive (3) ────────────────────────────────────
    (53, 'Tom Whitfield',             'Sales Executive',                   'D&D London',                     'London', 'EC2R 8DL', 2, ARRAY['Sales','CRM','Salesforce','Account Management'],
       'Sales Executive at D&D London; multi-site qualification + close.',
       '[{"role":"Sales Executive","venue":"D&D London","from":"2024-04","to":"present","detail":"Multi-site sales support across 12 venues."}]'::jsonb,
       35000, 42000,
        10, 'pending',      3, NULL, NULL),
    (54, 'Anjali Mehta',              'Sales Executive',                   'Soho House Group',               'London', 'W1D 3QF', 3, ARRAY['Sales','CRM','Salesforce','Membership Sales','Account Management'],
       'Sales Exec at Soho House; membership and venue sales. Looking for restaurant-group focus.',
       '[{"role":"Sales Executive","venue":"Soho House Group","from":"2023-08","to":"present"}]'::jsonb,
       36000, 42000,
        10, 'reviewing',    8, NULL, NULL),
    (55, 'Edward Carrington',         'Senior Sales Executive',            'The Ned',                        'London', 'EC2R 8AJ', 4, ARRAY['Sales','B2B','Salesforce','Account Management'],
       'Senior Sales Exec at The Ned; ready for AM step-up but happy with senior IC role.',
       '[{"role":"Senior Sales Executive","venue":"The Ned","from":"2022-09","to":"present"}]'::jsonb,
       38000, 45000,
        10, 'interview',   14, NULL, 'scheduled-future'),

    -- ── Job 11: Corporate Account Manager (2) ────────────────────────────────
    (56, 'Henry Lambert',             'Account Manager',                   'D&D London',                     'London', 'EC2R 8DL', 6, ARRAY['B2B Sales','Account Management','QBRs','Salesforce','Hospitality Sales'],
       'AM at D&D London; £2.1M book across 25 corporate accounts.',
       '[{"role":"Account Manager","venue":"D&D London","from":"2022-04","to":"present","detail":"£2.1M book. 25 named accounts. Salesforce + HubSpot."}]'::jsonb,
       50000, 58000,
        11, 'reviewing',   10, NULL, NULL),
    (57, 'Ashvin Patel',              'Senior Account Manager',            'Soho House Group',               'London', 'W1D 3QF', 7, ARRAY['B2B Sales','Account Management','QBRs','Membership Sales','Hospitality Sales'],
       'Senior AM at Soho House; corporate membership + venue partnerships. Tier-1 client book.',
       '[{"role":"Senior Account Manager","venue":"Soho House Group","from":"2021-09","to":"present","detail":"£3M annual book. Tier-1 corporate clients."}]'::jsonb,
       55000, 65000,
        11, 'interview',   16, NULL, 'confirmed-future'),

    -- ── Job 12: Operations Manager (3) ───────────────────────────────────────
    (58, 'Rebecca Sinclair',          'Senior Operations Manager',         'Pizza Pilgrims',                 'London', 'W1F 8AY', 6, ARRAY['Multi-site Ops','Compliance','Suppliers','P&L','EHO Audits'],
       'Senior Ops at Pizza Pilgrims; oversees 8 sites. Looking for smaller-group impact.',
       '[{"role":"Senior Operations Manager","venue":"Pizza Pilgrims","from":"2022-04","to":"present","detail":"8 sites, 200 staff."}]'::jsonb,
       55000, 65000,
        12, 'pending',     5, NULL, NULL),
    (59, 'Will Hartshorne',           'Operations Manager',                'Hawksmoor',                      'London', 'E1 6JJ', 7, ARRAY['Multi-site Ops','P&L','Compliance','Training','Suppliers'],
       'Ops Manager at Hawksmoor; covers 5 London sites.',
       '[{"role":"Operations Manager","venue":"Hawksmoor","from":"2021-08","to":"present","detail":"5 sites. Strong P&L track record."}]'::jsonb,
       58000, 70000,
        12, 'reviewing',   11, NULL, NULL),
    (60, 'Aditi Singh',               'Operations Manager',                'Dishoom Group',                  'London', 'EC2A 3BS', 6, ARRAY['Multi-site Ops','Compliance','Training','Suppliers','High Volume'],
       'Ops Manager at Dishoom Group; high-volume environment.',
       '[{"role":"Operations Manager","venue":"Dishoom Group","from":"2022-04","to":"present","detail":"6 sites, 350 staff."}]'::jsonb,
       55000, 65000,
        12, 'shortlisted', 14, NULL, NULL),

    -- ── Job 13: General Manager (2) ──────────────────────────────────────────
    (61, 'Marcus Beckett',            'General Manager',                   'Hawksmoor Spitalfields',          'London', 'E1 6JJ', 9, ARRAY['GM','P&L','Multi-site Ops','Team Development','Brand Standards'],
       'GM at Hawksmoor Spitalfields. £6.8M revenue, 36 staff. Looking for slightly less volume + more brand-build scope.',
       '[{"role":"General Manager","venue":"Hawksmoor Spitalfields","from":"2022-04","to":"present","detail":"£6.8M revenue. 36 staff. Operating margin grew from 11% to 14% under his ownership."}]'::jsonb,
       62000, 75000,
        13, 'offered',     22, NULL, NULL),
    (62, 'Suniti Iyengar',            'Senior GM',                         'NoMad London',                   'London', 'WC2H 8DJ', 8, ARRAY['GM','P&L','Brand Standards','Team Development','High Volume','Hotel'],
       'Senior GM at NoMad. Hotel + restaurant integration.',
       '[{"role":"Senior General Manager","venue":"NoMad London","from":"2022-09","to":"present"}]'::jsonb,
       65000, 78000,
        13, 'hired',       28, NULL, NULL),

    -- ── Job 14: People & Culture Manager (3) ─────────────────────────────────
    (63, 'Eleanor Whitmore',          'People & Culture Manager',          'Pizza Pilgrims',                 'London', 'W1F 8AY', 5, ARRAY['HR','Recruitment','Performance','ER','CIPD 5'],
       'P&C Manager at Pizza Pilgrims; full lifecycle. CIPD 5.',
       '[{"role":"People & Culture Manager","venue":"Pizza Pilgrims","from":"2023-04","to":"present","detail":"6 sites, 180 staff."}]'::jsonb,
       45000, 55000,
        14, 'pending',     6, NULL, NULL),
    (64, 'Hannah Kreutzer',           'HR Business Partner',               'D&D London',                     'London', 'EC2R 8DL', 6, ARRAY['HR','HRBP','ER','Performance','CIPD 5'],
       'HRBP at D&D London; multi-site. Looking for smaller-group impact.',
       '[{"role":"HR Business Partner","venue":"D&D London","from":"2022-04","to":"present","detail":"12 sites, 700 staff."}]'::jsonb,
       50000, 58000,
        14, 'shortlisted', 12, NULL, NULL),
    -- NOTE: idx 65 is 'pending' (not 'interview') so the per-status totals land
    -- at 24 pending / 12 reviewing / 8 shortlisted / 11 interview / 6 offered /
    -- 2 hired / 2 rejected. Verified by Phase 5 counts.
    (65, 'Reema Verma',               'People & Culture Manager',          'Dishoom Group',                  'London', 'EC2A 3BS', 6, ARRAY['HR','Recruitment','Performance','ER','Diversity','CIPD 5'],
       'P&C Manager at Dishoom; diversity and inclusion programme lead.',
       '[{"role":"People & Culture Manager","venue":"Dishoom Group","from":"2022-04","to":"present"}]'::jsonb,
       48000, 58000,
        14, 'pending',     18, NULL, NULL)
  ) AS t (
    idx, full_name, current_title, current_venue, city, postcode, years_exp, skills, bio, work_history,
    salary_min, salary_max, job_idx, status,
    days_ago_created,                  -- when candidate's profile was created
    days_ago_status_updated_override,  -- backdated status_updated_at if any (NULL = use days_ago_created/2)
    interview_kind                     -- NULL / 'scheduled-future' / 'confirmed-future' / 'completed-past'
  )
),

-- ─── Insert auth.users for the 65 candidates ────────────────────────────────
inserted_auth_users AS (
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, email_confirmed_at,
    encrypted_password, raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'pauldavies.gbr+demo' || lpad(cd.idx::text, 2, '0') || '@gmail.com',
    now() - (cd.days_ago_created || ' days')::interval,
    crypt('TheMunch2017!', gen_salt('bf')),
    jsonb_build_object(
      'role', 'employee',
      'full_name', cd.full_name,
      'is_simulated', true
    ),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    now() - (cd.days_ago_created || ' days')::interval,
    now() - (cd.days_ago_created || ' days')::interval
  FROM candidate_data cd
  RETURNING id, email
),

-- ─── Insert candidate_profiles linked by email ──────────────────────────────
inserted_candidates AS (
  INSERT INTO public.candidate_profiles (
    user_id, full_name, email, phone, location, city, postcode, county,
    job_title, years_experience, skills, bio, work_history,
    salary_min, salary_max, salary_period,
    has_right_to_work, account_type, account_status, job_sector,
    created_at, updated_at
  )
  SELECT
    iau.id,
    cd.full_name,
    iau.email,
    '+447700' || lpad((900000 + cd.idx)::text, 6, '0'),
    cd.city || ', ' || cd.postcode,
    cd.city,
    cd.postcode,
    'Greater London',
    cd.current_title,
    cd.years_exp,
    cd.skills,
    cd.bio,
    cd.work_history,
    cd.salary_min,
    cd.salary_max,
    'year',
    true,
    'job_seeker',
    'active',
    'hospitality',
    now() - (cd.days_ago_created || ' days')::interval - (cd.idx || ' minutes')::interval,
    now() - (cd.days_ago_created || ' days')::interval
  FROM candidate_data cd
  JOIN inserted_auth_users iau ON iau.email = 'pauldavies.gbr+demo' || lpad(cd.idx::text, 2, '0') || '@gmail.com'
  RETURNING id, user_id, email
),

-- ─── Insert 65 applications, joining candidate idx → job idx ────────────────
inserted_apps AS (
  INSERT INTO public.job_applications (
    candidate_id, job_id, status, job_title, company,
    cover_letter, applied_at, status_updated_at, created_at, updated_at, viewed_at
  )
  SELECT
    ic.user_id,
    ij.id AS job_id,
    cd.status,
    ij.title,
    'Ember Hospitality Group',
    'Hi, I''m ' || cd.full_name || '. ' || cd.bio || ' Excited about Ember.',
    now() - (cd.days_ago_created || ' days')::interval,
    -- status_updated_at: backdated override if specified, else proportional to days_ago_created
    CASE
      WHEN cd.status = 'pending' THEN NULL
      WHEN cd.days_ago_status_updated_override IS NOT NULL
        THEN now() - (cd.days_ago_status_updated_override || ' days')::interval
      ELSE now() - ((cd.days_ago_created/2) || ' days')::interval
    END,
    now() - (cd.days_ago_created || ' days')::interval,
    now() - LEAST(cd.days_ago_created, 2) * interval '1 day',
    -- viewed_at: NULL for pending, set for everything else
    CASE WHEN cd.status = 'pending' THEN NULL
         ELSE now() - ((cd.days_ago_created - 1) || ' days')::interval END
  FROM candidate_data cd
  JOIN inserted_candidates ic ON ic.email = 'pauldavies.gbr+demo' || lpad(cd.idx::text, 2, '0') || '@gmail.com'
  JOIN inserted_jobs ij ON
    -- map job_idx 1..14 to title
    ij.title = (CASE cd.job_idx
      WHEN  1 THEN 'Head Chef'
      WHEN  2 THEN 'Sous Chef'
      WHEN  3 THEN 'Pastry Chef'
      WHEN  4 THEN 'Chef de Partie'
      WHEN  5 THEN 'Restaurant Manager'
      WHEN  6 THEN 'Assistant Restaurant Manager'
      WHEN  7 THEN 'Bartender'
      WHEN  8 THEN 'Waiter / Waitress'
      WHEN  9 THEN 'Events & Private Dining Sales Manager'
      WHEN 10 THEN 'Group Sales Executive'
      WHEN 11 THEN 'Corporate Account Manager'
      WHEN 12 THEN 'Operations Manager'
      WHEN 13 THEN 'General Manager'
      WHEN 14 THEN 'People & Culture Manager'
    END)
  RETURNING id, candidate_id, job_id, status
),

-- ─── 11 interviews, attached to interview-status applications ───────────────
inserted_interviews AS (
  INSERT INTO public.interviews (
    application_id, job_id, employer_id, candidate_id,
    interview_date, interview_time, duration_minutes,
    interview_type, location_or_link, notes, status,
    created_at, updated_at
  )
  SELECT
    ia.id,
    ia.job_id,
    '277c20ae-ac3e-4048-9b99-66f41cbf1861'::uuid,
    ia.candidate_id,
    -- date + time pick by interview_kind + idx for spread
    (CASE cd.interview_kind
      WHEN 'completed-past'    THEN current_date - (CASE cd.idx WHEN 4 THEN 1 WHEN 9 THEN 3 WHEN 21 THEN 13 WHEN 26 THEN 6 END)
      WHEN 'confirmed-future'  THEN current_date + (CASE cd.idx WHEN 14 THEN 3 WHEN 32 THEN 5 WHEN 65 THEN 9 WHEN 57 THEN 10 END)
      WHEN 'scheduled-future'  THEN current_date + (CASE cd.idx WHEN 38 THEN 10 WHEN 47 THEN 2 WHEN 48 THEN 12 WHEN 55 THEN 14 END)
    END)::date,
    (CASE cd.idx % 4 WHEN 0 THEN '10:00' WHEN 1 THEN '11:30' WHEN 2 THEN '14:00' ELSE '15:30' END)::time,
    CASE WHEN cd.job_idx <= 4 THEN 60 WHEN cd.job_idx <= 8 THEN 45 ELSE 60 END,
    CASE WHEN cd.job_idx IN (10,11,12) THEN 'video' ELSE 'in-person' END,
    CASE
      WHEN cd.job_idx IN (10,11,12) THEN 'https://meet.google.com/abc-defg-hij'
      ELSE 'Ember Mayfair, 12 Grosvenor Street, London W1K 4QA'
    END,
    'Trial shift discussion + venue tour. Bring portfolio if relevant.',
    CASE cd.interview_kind
      WHEN 'completed-past'   THEN 'completed'
      WHEN 'confirmed-future' THEN 'confirmed'
      WHEN 'scheduled-future' THEN 'scheduled'
    END,
    now() - ((cd.days_ago_created/2) || ' days')::interval,
    now() - interval '1 day'
  FROM candidate_data cd
  JOIN inserted_candidates ic ON ic.email = 'pauldavies.gbr+demo' || lpad(cd.idx::text, 2, '0') || '@gmail.com'
  JOIN inserted_apps ia ON ia.candidate_id = ic.user_id
  WHERE cd.interview_kind IS NOT NULL
  RETURNING id, status, interview_date
)

SELECT
  (SELECT COUNT(*) FROM inserted_jobs)        AS jobs_inserted,
  (SELECT COUNT(*) FROM inserted_auth_users)  AS auth_users_inserted,
  (SELECT COUNT(*) FROM inserted_candidates)  AS candidates_inserted,
  (SELECT COUNT(*) FROM inserted_apps)        AS apps_inserted,
  (SELECT COUNT(*) FROM inserted_interviews)  AS interviews_inserted,
  (SELECT json_object_agg(status, n) FROM (SELECT status, COUNT(*) AS n FROM inserted_apps GROUP BY status) s) AS apps_by_status,
  (SELECT json_object_agg(status, n) FROM (SELECT status, COUNT(*) AS n FROM inserted_interviews GROUP BY status) s) AS interviews_by_status;

-- ── Venue assignment ────────────────────────────────────────────────────────
-- Multi-site demo: 13/14 jobs get a venue ("The Ember", "Ember Soho",
-- "Ember Bridge", "Ember HQ"); the Operations Manager covers all 4 sites
-- so it stays NULL to demo the single-site fallback render on /my-jobs.
-- Grouping is driven by the existing area field — keeps this idempotent
-- and avoids depending on title spellings.
UPDATE public.jobs
SET venue = CASE area
  WHEN 'Mayfair, W1K'    THEN 'The Ember'
  WHEN 'Soho, W1F'       THEN 'Ember Soho'
  WHEN 'Shoreditch, E2'  THEN 'Ember Bridge'
  WHEN 'Marylebone, W1U' THEN 'Ember HQ'
  ELSE NULL
END
WHERE employer_id = '277c20ae-ac3e-4048-9b99-66f41cbf1861'::uuid;
