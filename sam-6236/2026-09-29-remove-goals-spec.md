# Change spec: remove conversion goals from the in-app channel (Jira SAM-6236 epic and stories)

Jira cloudId: b9040d4e-c367-4260-9120-5806d7d16cf1. Read the CURRENT description with getJiraIssue (responseContentFormat "markdown") and write it back with editJiraIssue (contentFormat "markdown", fields {"description": ...}). Remove only what is listed; keep everything else identical, including the Service/Purpose content. Plain English, no requirement or screen codes. If a call fails with a transient "classifier gave no verdict" error, retry up to 3 times with a pause.

Decision: in-app does not set up, pick or count conversion goals for now. A shared, channel-agnostic Goals service will handle that later. In-app analytics stops at Clicked.

- Epic SAM-6236:
  - Add to "What it does not do": "Conversion goals and attribution. A shared Goals service will handle them for every channel later; in-app results stop at Clicked."
  - Remove the glossary rows for Goal, Converted and Attribution window.
  - Remove any goal or attribution rows from the Values table.
  - Remove Settings → Goals from the screens table.
  - Remove goal mentions from the Roles row.
  - Remove "Conversion goal" from any list of campaign fields.
- SAM-6237 (Journey node panel):
  - Remove the Conversion goal and Attribution window rows.
  - Remove any requirement or acceptance criterion about goals or conversions.
- SAM-6239 (In-app settings):
  - Remove the whole Goals section: table, CTAs, states, requirements and change-log mentions of goals.
  - Remove the P0 acceptance criterion about adding a goal, and renumber.
- SAM-6241 (One-Time Campaign Setup):
  - Remove the Conversion goal and Attribution window rows and their requirements.
  - Remove mentions of goals from the Publish validation.
- SAM-6243 (Campaign Analytics):
  - Remove Tile 5 Converted. Tiles are Eligible, Shown, Clicked, Dismissed.
  - The funnel is Eligible → Shown → Clicked.
  - Key Performance Metrics keeps only User Engaged = Clicked (unique).
  - Remove the goal counting, attribution and no-de-duplication requirements.
  - Remove the Total/Unique notes about Converted.
  - Remove the acceptance criteria about conversion or "No goal set", and renumber.
  - In the "P1 and P2 checks" line, drop SAM-6300 and SAM-6301.
- SAM-6238, SAM-6240, SAM-6242: remove any mention of goals, conversions or attribution, if present.

Report per issue what was removed and the P0 count.
