# Change spec: add a Service campaign type (Jira SAM-6236 epic + stories)

Jira cloudId: b9040d4e-c367-4260-9120-5806d7d16cf1. Read the CURRENT description with getJiraIssue (responseContentFormat "markdown"). Write it back with editJiraIssue (contentFormat "markdown", fields {"description": ...}). Change only what is listed here; keep everything else identical.
- Plain English only. No requirement, screen or element codes (no CMO-, IA01-, SCR-, NFR-, SDK-n, §).
- Don't break the "P1 and P2 checks" key lists.
- A story has at most 8 P0 acceptance criteria. If a story is already at 8, do not add a P0; the new checks go to Test Cases (handled separately).
- If editJiraIssue fails with a transient "classifier gave no verdict" error, retry up to 3 times with a pause.

## The rule
Every in-app campaign has a **Purpose**: **Marketing** (default) or **Service**. A Service campaign is about the person's own account or transaction, for example "Your instalment is due", "Upload your ID to finish sign-up" or "Your order has shipped". It is never a promotion.

| Rule | Marketing | Service |
| --- | --- | --- |
| Shown to people who turned off in-app marketing | No | Yes |
| Counts toward, and is held back by, the fatigue limit | Yes | No |
| Quiet screens, transactional messages, one overlay at a time | Apply | Apply |
| Frequency cap, cooldown, priority, Depends on, online check, offline limit | Apply | Apply |
| When a Service and a Marketing overlay are ready at once | Loses to Service | Wins, whatever the priority numbers |
| Who can publish | Marketer or Marketing Admin (Custom HTML: Admin) | Marketing Admin only |

- **Declaration at publish:** publishing a Service campaign needs a ticked declaration: "This message is about the person's own account or transaction, not a promotion." Without it, Publish is disabled.
- **Changing Purpose:** Purpose can be changed only while the campaign is a Draft. After first publish it is locked; to change it, Clone.
- **Priority 1 overuse badge:** doesn't apply to Service campaigns.

## Where it goes
- **Epic SAM-6236**
  - Add to "What it is": in-app messages can be Marketing or Service.
  - Add a glossary row "Purpose (Marketing / Service)" with the table's meaning in one or two sentences.
  - Update the "Opted out" and "Fatigue limit" glossary rows to say they apply to Marketing campaigns only.
  - Update the Roles row: only a Marketing Admin publishes Service campaigns.
- **SAM-6238 (Studio, campaign list, New overlay window)**
  - Add a "Purpose" field to the New overlay window: radio Marketing / Service, mandatory, default Marketing, with helper text "Service: about the person's own account or transaction. Shown even to people who turned off marketing."
  - Show Purpose on the content page header as a chip.
  - Add a Purpose column to the campaign list and add Purpose to its filters.
  - Requirements:
    - Purpose is set at creation and can be changed only in Draft.
    - Service campaigns can be published only by a Marketing Admin, after ticking the declaration. For a Marketer, Publish is disabled with the copy "Service campaigns need a Marketing Admin to publish."
    - Clone keeps Purpose.
    - The Priority 1 overuse badge never shows on Service campaigns.
- **SAM-6241 (One-Time Campaign Setup)**
  - Add a "Purpose" field (same as above) right after Campaign Name.
  - Add the declaration checkbox, shown only for Service.
  - Reachable User Count for Service counts segment members with the app who have logged in at least once, including people who turned off in-app marketing. The helper line reads "Service messages also reach people who turned off in-app marketing."
  - Add the matching requirements.
- **SAM-6237 (Journey Builder In-App node)**
  - The Campaign dropdown shows each campaign's Purpose.
  - The node card shows "Purpose: [Marketing/Service]".
  - The node has no Purpose of its own; it inherits the campaign's.
- **SAM-6239 (display rules, In-app settings)**
  - Add requirements for the opt-out and fatigue exemptions, and for Service beating Marketing.
  - State that quiet screens and transactional messages still apply to Service.
  - Reword the opt-out guard to "never show a Marketing overlay to a person who has opted out of in-app marketing".
- **SAM-6240 (Mobile SDK)**
  - The phone must know each campaign's Purpose and apply the exemptions above.
  - The opt-out call turns off Marketing overlays only.
  - Update the opt-out requirement's wording accordingly.
- **SAM-6243 (analytics)**
  - Show a Purpose chip beside the status chip.
  - For Service campaigns, "Why not shown" never lists "Opted out" or "Fatigue limit".
  - Add a Purpose filter wherever campaigns are listed in analytics, if a list exists; otherwise just the chip.
