# Change spec: make the in-app channel business-agnostic (Jira SAM-6236 epic + stories + test cases)

Jira cloudId: b9040d4e-c367-4260-9120-5806d7d16cf1. Always read the CURRENT description with getJiraIssue (responseContentFormat "markdown") and write it back with editJiraIssue (contentFormat "markdown", fields {"description": ...}). Keep everything not named below exactly as it is (tables, error copy, acceptance-criteria numbering, Test Case key lists). Never add requirement/screen/element codes (no CMO-, IA01-, SCR-, NFR-, SDK-n, §, OCA, ITM). Plain English, short sentences.

## 1. Global wording (apply everywhere)
- "buyer" / "home buyer" -> "app user" (plural "app users"). Keep "Marketer", "Marketing Admin", "Viewer".
- "lead" (as in "As a buyer (pick a lead)", "Lead must exist", "Pick a lead to personalise the test.") -> "person": "As a person (pick one)", "Person must exist", "Pick a person to personalise the test."
- "manifest" -> "the phone's campaign copy"; "manifest refresh" -> "campaign sync"; "Manifest refresh interval" -> "sync interval"; "at their next manifest refresh" -> "at their next campaign sync", etc.
- "RM task" -> "follow-up task".
- Real-estate example data -> neutral: segment "Viewed 3BHK twice, Pune" -> "Viewed a product twice"; "/book-visit" -> "/book-appointment"; "/book-vist" (the deliberate typo) -> "/book-apointment"; "Book a visit" -> "Book now"; "booked a site visit" -> "completed the goal event (Purchase)"; "project details screen" -> "product details screen".
- Anything saying goals are "Site Visit Scheduled, Site Visit Completed, Booked" -> goals come from the tenant's Goals list (section 2).

## 2. Goals (new design)
Goals are set up once per tenant, not per campaign:
- **Where:** Settings -> Goals (a section on the In-app settings page, SAM-6239; usable by other channels later). Marketing Admin only; Marketers see it read-only.
- **Each goal has:** Name (1-50 chars, unique); Source event, picked from events Sirrus already receives (events the app sends through the SDK, or events from the client's CRM/backend); Optional filter on the event's properties (e.g. plan = "Gold"); Counting: "Once per person" or "Every time" (default Once per person); Default attribution window (1 hour to 30 days, default 7 days); Status Active/Archived (archived goals can't be picked; campaigns already using one keep reporting).
- Empty state: "No goals yet. Add one from an event your app or CRM sends."
- Every change logged in the In-app settings change log.
- **Campaign side** (One-Time Campaign Setup SAM-6241, In-App node panel SAM-6237): "Conversion goal" = dropdown of Active goals + "Manage goals" link (Marketing Admin); Attribution window pre-fills from the goal's default, editable 1 hour to 30 days, capped at the campaign's eligibility window + 30 days is NOT needed — just 1 hour to 30 days.
- **Counting** (SAM-6243): Converted = person had In-app Clicked for this campaign and the goal event happened within the attribution window after that click. "Once per person" goals count a person at most once per campaign; "Every time" goals count every qualifying event in Total mode and people in Unique mode. If the same goal event could be credited to several campaigns, each campaign counts it (no cross-channel de-duplication) — say so explicitly.
- Key Performance Metrics show the campaign's chosen goal (name, conversions, conversion rate = Converted ÷ Clicked) instead of fixed site-visit/booking numbers.

## 3. Quiet screens (SAM-6239, epic)
No hard-coded default screen names. When the app first connects, the In-app settings page suggests screens whose names contain checkout, payment, otp, sign, pin or password; the Marketing Admin confirms them. Until confirmed, a banner: "Pick your app's sensitive screens. Overlays never show on them." Keep the rule that no overlay shows during payment, one-time-password entry or document signing.

## 4. Pending fixes already agreed
- SAM-6238: comparison table "Action Buttons" In-App column -> "Up to 2", "Add Button (1/2)" (Button 1 is required), action = Screen Name, External URL, Dismiss, Request Push Permission, Open App Settings.
- SAM-6239: criterion 3 "that day" -> "within those 24 hours". Add requirement: "Priority 1 campaigns skip the fatigue limit; their frequency cap and cooldown still apply."
- SAM-6241: add requirement: "Cancelling a Scheduled campaign returns it to Draft with every field kept." In-session spacing field: "minimum gap after the last overlay closed before this campaign's overlay can show; each campaign waits its own spacing".
- SAM-6240: in-session spacing requirement: each campaign waits its own spacing after the last overlay closed (any campaign). Remove open question 1 about spacing and renumber. Impression event is named "In-app Shown (proposed name)". Offline limit and sync interval values are Proposed (see epic).
- Custom HTML buttons keep the screen-list check (no change).

## 5. Epic Values table: replace every **Missing** with these, labelled "(Proposed)"
Frequency cap 1 to 10 (default 3); Cooldown 1 hour to 7 days (default 24h); Priority 1 to 5 (default 3); Contextual trigger count 1 to 10; Text limits headline/body/button label: Centered Modal 60/160/20, Full-Screen Interstitial 60/200/20, Slide-In Drawer 50/120/20, Bottom Banner 40/90/16, Top Banner 40/90/16; Sync interval every 15 minutes while the app is open; Offline limit 24 hours; Late offline events counted up to 14 days after End; Priority 1 overuse threshold 30%; QR code lifetime 10 minutes; Test devices 20 per tenant; Custom HTML elements div, span, p, h1-h3, strong, em, br, ul, ol, li, img, button; attributes class, alt, src (bundle files only), width, height, data-sirrus-action; Bundle size 1 MB; Goal attribution window default 7 days. Replace the "Default quiet screens" row with "Quiet screens: none by default; suggested at app connection, Marketing Admin confirms". Update the intro sentence: rows marked (Proposed) are best guesses until confirmed against the PRD.
Epic glossary: formats are Centered Modal, Top Banner, Slide-In Drawer, Bottom Banner (proposed name), Full-Screen Interstitial (proposed name). Impression event: In-app Shown (proposed name). In-session spacing: each campaign waits its own spacing after the last overlay closed. Rename Manifest/Manifest refresh entries per section 1. Add "Goal" entry (section 2) and change "Converted" to use goals. Add to "What it does not do"/scope: "Built for any business: no industry-specific goals, screens or wording." Add a Glossary row "App user: anyone using the client's app, at any stage (prospect or existing customer)."
