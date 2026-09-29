# Change spec: drop "Depends on"; add UTMs to every button (in-app channel)

## A. Drop "Depends on" for v1
Remove the whole "Depends on" feature: the campaign field, the incident/outage guard, the "Outage on dependency" reason in "Why not shown" (the other reasons stay in the same order), the service list, glossary entries and any acceptance criteria or test checks about it. Marketers pause a campaign if something it links to is broken. Epic "What it does not do" gets: "Holding overlays back automatically when a linked service is down. Pause the campaign instead."

## B. UTMs on every button
Each button with an action that opens something (Screen Name or External URL; not Dismiss, Request Push Permission or Open App Settings) has a **UTM tracking** section, like push:

| Field | Default | Rule |
| --- | --- | --- |
| Source | `sirrus` | Required |
| Medium | `in_app` | Required |
| Campaign | the campaign name, lower-case, spaces as underscores | Required |
| Term | empty | Optional |
| Content | `button_1` or `button_2` | Optional |

- Values: letters, numbers, `-`, `_`, `.` only, up to 100 characters each. Error: "UTM values can use letters, numbers, - _ and . only."
- **External URL:** Sirrus adds `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` to the URL when the button is tapped, keeping any query string already in the URL. If the URL already has a `utm_` value, the button's value wins.
- **Screen Name:** the same UTM values travel with the deep link to the app screen.
  - The SDK hands them to the client app with the deep link, so the app's own analytics can read them.
  - The SDK attaches them to the "Screen viewed" event for that screen, so Sirrus can see which screens app users reached from which campaign.
  - They also attach to further "Screen viewed" events in the same app session, until the session ends or another campaign's button is tapped. Say this in plain words.
- **Preview:** the Live Template Preview shows the final link with UTMs when you hover or tap a button.
- **Test sends:** carry the UTMs too, with `utm_source=sirrus_test`.
- **Custom HTML buttons** get the same UTM section per button (primary and secondary).
- **Analytics:** Campaign Analytics gets a **"Screens reached"** card listing the screens app users opened from this campaign's buttons, with people (Unique) or views (Total) per screen, for the same session.
