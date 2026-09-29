// Sirrus In-App channel prototype, PRD Draft v7 (2026-09-22-PRD-in-app-notification-channel.md).
// Every number below cites its PRD section. Pure rules are exported on globalThis.IA for verify-v7.cjs.
(function () {
'use strict';

// ---------- PRD constants ----------
const FORMATS = { // §8 Text limits; §4B IA02-01
  modal:  { name: 'Centered Modal',          limits: [60, 200, 20], hint: 'Card in the middle, app dimmed behind. Closes with X, Back or a background tap (if on).' },
  top:    { name: 'Top Banner',              limits: [40, 60, 15],  hint: 'Slides in at the top and hides after the time-out. Closes with swipe up or X.' },
  bottom: { name: 'Bottom Banner',           limits: [40, 60, 15],  hint: 'Sits above the home bar. Never times out. Closes with X.' },
  drawer: { name: 'Slide-In Drawer',         limits: [50, 120, 20], hint: 'Half-height sheet with a light dim. Closes by dragging down or a background tap.' },
  full:   { name: 'Fullscreen Interstitial', limits: [60, 250, 20], hint: 'Covers the screen. 48px close button, shown instantly.' },
};
const RANGES = { // §8 rules table; §4B SCR-IA-01
  name: [1, 50], n: [1, 10], cap: [1, 5], cooldown: [1, 168], priority: [1, 5],
  fatigue: [1, 5], timeout: [4, 15], endMaxH: 720, endDefaultH: 72, triggerDelay: [0, 60], inSessionSpacing: [0, 600],
};
const DEFAULTS = { n: 1, cap: 3, cooldown: 24, priority: 3, fatigue: 1, timeout: 8, triggerDelay: 0, inSessionSpacing: 60 };
const DEVICE_LIMIT = 10; // §8 Test devices per tenant
const QUIET_DEFAULT = ['/checkout', '/payment_gateway', '/document_signing', '/otp_verification', '/booking_token_review']; // CMO-4.2
const APP_SCREENS = ['/home', '/project/centralis', '/floor-plans', '/book-visit', '/cost-sheet', '/kyc', '/rm-video-call', '/offers'];
const TOKENS = { first_name: 'Valued Homebuyer', project_name: 'our new project', city: 'your city', rm_name: 'your relationship manager' };
const EVENTS = ['Screen viewed', 'Viewed floor plan', 'Opened cost sheet', 'Shortlisted a unit', 'Started a booking'];
const SEGMENTS = [
  { id: 's1', name: 'Viewed 3BHK twice, Pune', users: 11300, reach: 4120 }, // §4B walkthrough + P0 AC
  { id: 's2', name: 'Centralis enquiries, last 30 days', users: 2450, reach: 1180 },
  { id: 's3', name: 'Walk-in leads, no app', users: 860, reach: 0 },
];
const LEADS = [
  { id: 'l1', name: 'Priya Sharma', first_name: 'Priya', project_name: 'Centralis', city: 'Pune', rm_name: 'Rohan' },
  { id: 'l2', name: 'Arjun Mehta', first_name: 'Arjun', project_name: 'Skyline Towers', city: 'Pune', rm_name: 'Neha' },
  { id: 'l3', name: 'Lead #88213 (no first name on file)', first_name: '', project_name: 'Centralis', city: '', rm_name: 'Rohan' },
];
const DEVICE_MODELS = [['Pixel 8a', 'android'], ['Galaxy S24', 'android'], ['iPhone 15', 'ios'], ['OnePlus 12', 'android'], ['Redmi Note 13', 'android'], ['iPhone 13 mini', 'ios'], ['Galaxy A55', 'android'], ['Pixel 7', 'android'], ['iPhone SE (3rd gen)', 'ios'], ['Moto G84', 'android']];
const REASONS = [ // §4B IA05-11 rows in PRD order, meanings from §2 / §3 / §8
  ['still', 'Still eligible', 'The campaign is live and they have not been shown it yet.'],
  ['noopen', 'App not opened in window', 'Did not open the app between Start and End.'],
  ['notrigger', 'Trigger never fired', 'Opened the app but never did the trigger event.'],
  ['optout', 'Opted out', 'Turned off in-app marketing in the app. Never shown.'],
  ['customhtml', "App can't show Custom HTML", 'Their app version is too old to show Custom HTML content.', 'html'],
  ['offline', 'Offline too long', 'The phone stayed offline past the 24h offline limit.'],
  ['quiet', 'Quiet screen', 'The trigger fired only on screens where overlays never show.'],
  ['transactional', 'Transactional message', 'A transactional message was on screen, so the overlay waited.'],
  ['fatigue', 'Fatigue limit', 'Already saw the app-wide maximum of overlays for the period.'],
  ['priority', 'Lost on priority', 'A higher-priority overlay won the screen every time.'],
  ['online', 'Online check failed', 'The offer could not be confirmed as still valid within 1.5s.'],
  ['paused', 'Campaign paused', 'Paused while they were eligible, and it ended before they were shown it.'],
];
const P1_OVERUSE = 0.30; // §8 Priority 1 overuse threshold (§13 decision 26)
const HTML_ELEMENTS = ['section', 'div', 'p', 'h1', 'h2', 'h3', 'span', 'strong', 'em', 'button', 'br', 'ul', 'ol', 'li', 'img']; // §8 Custom HTML
const HTML_ATTRS = ['class', 'aria-label', 'role', 'data-sirrus-action']; // §8 Custom HTML; src and alt allowed on img only
const BUTTON_ACTIONS = [['screen', 'Open a screen'], ['url', 'Open a web link (https)'], ['request-push-permission', 'Ask for push permission'], ['open-app-settings', 'Open notification settings']]; // §8, §13 decision 32
const ACTION_HINT = {
  'request-push-permission': "Closes the overlay and shows the phone's push permission prompt. If push is already allowed it just closes; if the phone won't prompt again, it opens this app's notification settings.",
  'open-app-settings': "Closes the overlay and opens this app's notification settings on the phone.",
};
const BUTTON_ROWS = [['b1', 'Button 1'], ['b2', 'Button 2'], ['x', 'Close (X)'], ['back', 'Back'], ['bg', 'Background tap'], ['swipe', 'Swipe'], ['timeout', 'Timed out or left screen']];
const ROLES = { marketer: 'Marketer', admin: 'Marketing Admin', viewer: 'Viewer' }; // §7
const H = 3600e3;

// ---------- pure rules ----------
const TOKEN_RE = /\{\{\s*([a-z_]+)\s*(?:\|\s*"([^"]*)"\s*)?\}\}/g;
function tokenIssues(text) {
  const out = []; let m; TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text || ''))) if (m[2] === undefined || m[2].trim() === '') out.push(m[0]);
  return out;
}
function resolveTokens(text, lead) {
  return String(text || '').replace(TOKEN_RE, (_, key, fb) => (lead && lead[key]) ? lead[key] : (fb || ''));
}
function visibleLength(text) { return resolveTokens(text, null).length; } // tokens count as their default value
function buttonCounter(content) { return (content.b2 ? 2 : 1) + '/2'; }

// ---------- UTM tracking on buttons that open something (Screen Name / External URL) ----------
const UTM_KEYS = [['source', 'Source', true], ['medium', 'Medium', true], ['campaign', 'Campaign', true], ['term', 'Term', false], ['content', 'Content', false]];
const UTM_MSG = 'UTM values can use letters, numbers, - _ and . only.';
const utmSlug = n => String(n || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '').slice(0, 100);
function opensSomething(b) { const a = (b && b.action) || 'screen'; return a === 'screen' || a === 'url'; }
function utmVals(b, name, slot) { // stored value wins; a key never touched falls back to the default
  const u = (b && b.utm) || {}, d = { source: 'sirrus', medium: 'in_app', campaign: utmSlug(name), term: '', content: slot }, o = {};
  UTM_KEYS.forEach(([k]) => { o[k] = u[k] === undefined ? d[k] : String(u[k]); });
  return o;
}
function utmIssues(b, name, slot, n) {
  if (!opensSomething(b)) return [];
  const v = utmVals(b, name, slot), out = [];
  UTM_KEYS.forEach(([k, l, req]) => {
    if (req && !v[k].trim()) out.push({ id: 'IA02-18', btn: n, msg: `Button ${n} UTM ${l} is required.` });
    else if (!/^[A-Za-z0-9_.-]*$/.test(v[k]) || v[k].length > 100) out.push({ id: 'IA02-18', btn: n, msg: `Button ${n} UTM ${l}: ${UTM_MSG}` });
  });
  return out;
}
function finalLink(b, name, slot, test) { // the link as tapped: existing query kept, the button's utm_ values win
  const v = utmVals(b, name, slot); if (test) v.source = 'sirrus_test';
  const base = (b.action || 'screen') === 'url' ? String(b.url || '') : String(b.screen || ''); if (!base) return '';
  const [pre, ...h] = base.split('#'), [path, ...q] = pre.split('?');
  const own = k => v[k] !== '' && v[k] != null;
  const kept = q.join('?').split('&').filter(x => x && !UTM_KEYS.some(([k]) => own(k) && x.toLowerCase().startsWith('utm_' + k + '=')));
  UTM_KEYS.forEach(([k]) => { if (own(k)) kept.push('utm_' + k + '=' + encodeURIComponent(v[k])); });
  return path + (kept.length ? '?' + kept.join('&') : '') + (h.length ? '#' + h.join('#') : '');
}
function campName() { const c = S.view === 'analytics' ? camp(S.id) : T.edit; return (c && c.name) || ''; }
function utmLinks(ct, name, test) { // [n, link] for each button that opens something
  const out = [];
  if (ct.kind === 'html') { const bs = htmlButtons(ct.html), m = ct.htmlActions || {}; [['primary', 1, 'button_1'], ['secondary', 2, 'button_2']].forEach(([k, n, slot]) => { if (bs.some(b => b.action === k) && m[k] && opensSomething(m[k])) { const l = finalLink(m[k], name, slot, test); if (l) out.push([n, l]); } }); }
  else [[ct.b1, 1, 'button_1'], [ct.b2, 2, 'button_2']].forEach(([b, n, slot]) => { if (b && opensSomething(b)) { const l = finalLink(b, name, slot, test); if (l) out.push([n, l]); } });
  return out;
}
function utmCaption(ct, opts) { return utmLinks(ct, opts.name != null ? opts.name : campName()).map(([n, l]) => `<div class="ov-utm" title="${esc(l)}">Button ${n} link: <code>${esc(l)}</code></div>`).join(''); }

function contentIssues(ct, ctx) {
  const out = []; if (!ct) return [{ id: 'IA01-05', msg: 'Add content before publishing.' }];
  if (ct.kind === 'html') return htmlIssues(ct).concat(htmlActionIssues(ct, ctx));
  const [hl, bl, btn] = FORMATS[ct.format].limits;
  if (!String(ct.headline || '').trim()) out.push({ id: 'IA02-02', msg: 'Enter a headline.' });
  if (visibleLength(ct.headline) > hl) out.push({ id: 'IA02-02', msg: `Headline must be ${hl} characters or fewer for ${FORMATS[ct.format].name}.` });
  if (visibleLength(ct.body) > bl) out.push({ id: 'IA02-02', msg: `Body must be ${bl} characters or fewer for ${FORMATS[ct.format].name}.` });
  if ([ct.headline, ct.body, ct.b1 && ct.b1.label, ct.b2 && ct.b2.label].some(t => tokenIssues(t).length)) out.push({ id: 'CMO-2.3', msg: 'All dynamic tokens require a default fallback value.' });
  const buttons = [ct.b1, ct.b2].filter(Boolean);
  buttons.forEach((b, i) => {
    const n = i + 1;
    if (!String(b.label || '').trim()) out.push({ id: n === 1 ? 'IA02-04' : 'IA02-05', msg: `Button ${n} needs a label.` });
    else if (visibleLength(b.label) > btn) out.push({ id: n === 1 ? 'IA02-04' : 'IA02-05', msg: `Button ${n} label must be ${btn} characters or fewer.` });
    const act = b.action || 'screen';
    if (act === 'screen') {
      if (!b.screen) out.push({ id: n === 1 ? 'IA02-04' : 'IA02-05', msg: `Pick a screen for Button ${n}.` });
      else if (ctx && !ctx.screensDown && !ctx.screens.includes(b.screen)) out.push({ id: 'CMO-2.5', msg: `Button ${n} links to ${b.screen}, which is not a screen in this app.` });
    } else if (act === 'url') {
      if (!b.url) out.push({ id: n === 1 ? 'IA02-04' : 'IA02-05', msg: `Enter an external URL for Button ${n}.` });
      else if (!b.url.startsWith('https://')) out.push({ id: n === 1 ? 'IA02-04' : 'IA02-05', msg: `Button ${n} URL must start with https://.` });
    }
    utmIssues(b, ctx && ctx.name, 'button_' + n, n).forEach(x => out.push(x));
  });
  if (ctx && ctx.screensDown && buttons.length) out.push({ id: 'CMO-2.5', msg: "Couldn't check deep links right now. Try again." });
  if (ct.media && ct.media.error) out.push({ id: 'IA02-03', msg: ct.media.error });
  if (ct.format === 'top' && !inRange(ct.timeout, [RANGES.timeout[0], RANGES.timeout[1]])) out.push({ id: 'IA02-01', msg: `Time-out must be between ${RANGES.timeout[0]} and ${RANGES.timeout[1]}.` });
  return out;
}
function inRange(v, [a, b]) { const n = Number(v); return v !== '' && v != null && Number.isInteger(n) && n >= a && n <= b; }
function defaultEnd(startMs) { return startMs + RANGES.endDefaultH * H; } // §8 Standalone End date
function startMs(c, now) { return c.startMode === 'now' ? now : Date.parse(c.start); }

const TOKEN_MSG = 'Personalisation is allowed in text only, not inside tags or attributes.';
function htmlButtons(html) { // IA02-14: buttons in document order with their data-sirrus-action
  const out = [], re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi; let m;
  while ((m = re.exec(html || ''))) { const a = /data-sirrus-action\s*=\s*"([^"]*)"/i.exec(m[1]); out.push({ action: a ? a[1] : '', text: m[2].replace(/<[^>]*>/g, '').trim() }); }
  return out;
}
function cssIssues(css) { return /@|url\s*\(|\\|[<>]/i.test(css || '') ? [{ id: 'IA02-12', msg: "CSS can't contain @ rules, url(), backslash escapes or HTML." }] : []; }
function htmlIssues(ct) { // CMO-12.2 / 12.3 and §8 Custom HTML rules; copy from IA02-11 to IA02-14
  const html = String(ct.html || ''), out = [], seen = new Set();
  const add = (id, msg) => { if (!seen.has(msg)) { seen.add(msg); out.push({ id, msg }); } };
  if (!html.trim()) add('IA02-11', 'Add your HTML.');
  const tagRe = /<\s*(\/?)\s*([a-zA-Z][\w-]*)([^>]*)>/g; let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[2].toLowerCase(), attrs = m[3];
    if (tag === 'script') { add('IA02-11', "Scripts aren't allowed. Sirrus handles button taps and closing."); continue; }
    if (!HTML_ELEMENTS.includes(tag)) { if (!m[1]) add('IA02-11', `Unsupported element: ${tag}.`); continue; }
    if (m[1]) continue;
    if (/\{\{/.test(attrs)) add('IA02-11', TOKEN_MSG);
    const aRe = /([^\s=\/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g; let am;
    while ((am = aRe.exec(attrs))) {
      const n = am[1].toLowerCase(), v = (am[2] || '').replace(/^["']|["']$/g, '');
      if (/^on/.test(n)) { add('IA02-11', "Scripts aren't allowed. Sirrus handles button taps and closing."); continue; }
      if (tag === 'img' && n === 'alt') continue;
      if (tag === 'img' && n === 'src') {
        if (/^(https?:|\/\/|data:)/i.test(v)) add('IA02-11', "Images must be files inside the zip bundle. Outside image links aren't allowed.");
        else if (!(ct.files || []).includes(v)) add('IA02-11', `${v || 'An image'} is referenced but isn't in the bundle.`);
        continue;
      }
      if (!HTML_ATTRS.includes(n)) add('IA02-11', `Unsupported attribute: ${n}.`);
    }
  }
  if (tokenIssues(html.replace(/<[^>]*>/g, ' ')).length) add('CMO-2.3', 'All dynamic tokens require a default fallback value.');
  cssIssues(ct.css).forEach(x => add(x.id, x.msg));
  const bs = htmlButtons(html);
  if (bs.some(b => !['primary', 'secondary', 'dismiss'].includes(b.action))) add('IA02-14', 'Every button needs data-sirrus-action: primary, secondary or dismiss.');
  const prim = bs.filter(b => b.action === 'primary').length, other = bs.filter(b => b.action === 'secondary' || b.action === 'dismiss').length;
  if (html.trim() && !prim) add('IA02-14', 'Add one button with data-sirrus-action="primary". It becomes Button 1.');
  else if (prim > 1 || other > 1) add('IA02-14', 'Use one primary button and at most one secondary or dismiss button.');
  return out;
}
function htmlActionIssues(ct, ctx) { // IA02-15: where a button goes is set in Sirrus, never in the HTML (CMO-12.4)
  const out = [], bs = htmlButtons(ct.html), map = ct.htmlActions || {};
  [['primary', 1], ['secondary', 2]].forEach(([k, n]) => {
    if (!bs.some(b => b.action === k)) return;
    const b = map[k] || {}, act = b.action || 'screen';
    if (act === 'screen') {
      if (!b.screen) out.push({ id: 'IA02-15', btn: n, msg: `Pick a screen for Button ${n}.` });
      else if (ctx && !ctx.screensDown && !ctx.screens.includes(b.screen)) out.push({ id: 'CMO-2.5', btn: n, msg: `Button ${n} links to ${b.screen}, which is not a screen in this app.` });
    } else if (act === 'url' && !String(b.url || '').startsWith('https://')) out.push({ id: 'IA02-15', btn: n, msg: 'URL must start with https://' });
    utmIssues(b, ctx && ctx.name, 'button_' + n, n).forEach(x => out.push(x));
  });
  return out;
}
function p1Share(c, tenantImpr7d) { return c.priority == 1 && tenantImpr7d ? (c.p1Impr7d || 0) / tenantImpr7d : 0; } // CMO-5.6, IA05-15
function p1Overuse(c, tenantImpr7d) { return p1Share(c, tenantImpr7d) > P1_OVERUSE; } // IA06-04: warns, never blocks

function validate(c, ctx) { // SCR-IA-01 error copy, in field order
  const now = ctx.now, out = [];
  const nm = String(c.name || '').trim();
  if (!nm) out.push({ id: 'IA01-02', msg: 'Enter a campaign name.' });
  else if (nm.length > RANGES.name[1]) out.push({ id: 'IA01-02', msg: `Campaign name must be ${RANGES.name[1]} characters or fewer.` });
  if (!c.segment && !c.journey) out.push({ id: 'IA01-03', msg: 'Select a segment.' });
  if (!c.content) out.push({ id: 'IA01-05', msg: 'Add content before publishing.' });
  else contentIssues(c.content, ctx).forEach(i => out.push(i));
  if (c.content && c.content.kind === 'html' && ctx.role !== 'admin') out.push({ id: 'IA01-05', msg: 'Custom HTML content needs a Marketing Admin to publish.' }); // CMO-12.5
  if (c.journey) return out; // the journey decides who and when (SCR-IA-04)
  if (c.trigger.type === 'event') {
    if (!c.trigger.event) out.push({ id: 'IA01-06', msg: 'Pick an event for the trigger.' });
    if (!inRange(c.trigger.n, RANGES.n)) out.push({ id: 'IA01-06', msg: `Times (N) must be between ${RANGES.n[0]} and ${RANGES.n[1]}.` });
    if (c.trigger.event === 'Screen viewed') {
      if (!c.trigger.screen) out.push({ id: 'IA01-07', msg: 'Pick the screen for the trigger.' });
      else if (ctx.quiet.includes(c.trigger.screen)) out.push({ id: 'IA01-07', msg: `${c.trigger.screen} is a quiet screen. Overlays never show there.` });
    }
  }
  [['cap', 'Frequency cap'], ['cooldown', 'Cooldown'], ['priority', 'Priority']].forEach(([k, label]) => {
    if (!inRange(c[k], RANGES[k])) out.push({ id: 'IA01-08', msg: `${label} must be between ${RANGES[k][0]} and ${RANGES[k][1]}.` });
  });
  if (c.triggerDelay != null && c.triggerDelay !== '' && !inRange(c.triggerDelay, RANGES.triggerDelay)) {
    out.push({ id: 'IA01-16', msg: `Trigger delay must be between ${RANGES.triggerDelay[0]} and ${RANGES.triggerDelay[1]} seconds.` });
  }
  if (c.inSessionSpacing != null && c.inSessionSpacing !== '' && !inRange(c.inSessionSpacing, RANGES.inSessionSpacing)) {
    out.push({ id: 'IA01-17', msg: `In-session spacing must be between ${RANGES.inSessionSpacing[0]} and ${RANGES.inSessionSpacing[1]} seconds.` });
  }
  const s = startMs(c, now), e = Date.parse(c.end);
  if (c.startMode === 'schedule' && !(s > now)) out.push({ id: 'IA01-14', msg: 'Start time must be in the future.' });
  if (!(e > s) || e - s > RANGES.endMaxH * H) out.push({ id: 'IA01-15', msg: 'End must be after start and within 30 days of it.' });
  return out;
}

const TRANSITIONS = { // §6.1 state table; §7 roles
  publish: { from: ['Draft'], roles: ['marketer', 'admin'] },
  start:   { from: ['Scheduled'], roles: ['system'], to: 'Published' },
  cancel:  { from: ['Scheduled'], roles: ['marketer', 'admin'], to: 'Draft' },
  pause:   { from: ['Published'], roles: ['marketer', 'admin'], to: 'Paused' },
  resume:  { from: ['Paused'], roles: ['marketer', 'admin'], to: 'Published' },
  end:     { from: ['Published', 'Paused'], roles: ['system'], to: 'Ended' },
  archive: { from: ['Draft', 'Paused', 'Ended'], roles: ['admin'], to: 'Archived' },
  clone:   { from: ['Ended'], roles: ['marketer', 'admin'], to: 'Ended' },
  republish: { from: ['Published', 'Paused'], roles: ['marketer', 'admin'] },
};
function transition(c, ev, role, now) {
  const t = TRANSITIONS[ev];
  if (!t) return { ok: false, error: 'Unknown action.' };
  if (ev === 'archive' && c.status === 'Scheduled') return { ok: false, error: 'Cancel the schedule before archiving.' }; // IA06-05
  if (ev === 'archive' && c.status === 'Published') return { ok: false, error: 'Pause the campaign before archiving.' };
  if (!t.from.includes(c.status)) return { ok: false, error: `Can't ${ev} a ${c.status} campaign.` };
  if (!t.roles.includes(role)) return { ok: false, error: `${ROLES[role] || role} can't ${ev}.` };
  if (ev === 'publish') return { ok: true, to: startMs(c, now) > now ? 'Scheduled' : 'Published' };
  if (ev === 'republish') return { ok: true, to: c.status, version: c.version + 1 };
  return { ok: true, to: t.to };
}
function pct(n, base) { return !base ? 'N/A' : (Math.round((n / base) * 1000) / 10).toFixed(1) + '%'; } // §8 zero-base rule
function expiredTotal(st) { return REASONS.slice(1).reduce((a, [k]) => a + (st.reasons[k] || 0), 0); }
function invariantHolds(st) { return st.eligible === st.shownU + expiredTotal(st) + (st.still || 0); } // CMO-8.4
function closeOut(st) { // edge case: at End every Still eligible person gets an Expired reason (illustrative split)
  const r = { ...st.reasons }, n = st.still || 0;
  const split = [['noopen', 0.55], ['notrigger', 0.3], ['priority', 0.08], ['fatigue', 0.04]];
  let used = 0; split.forEach(([k, f]) => { const v = Math.floor(n * f); r[k] = (r[k] || 0) + v; used += v; });
  r.offline = (r.offline || 0) + (n - used);
  return { ...st, still: 0, reasons: r };
}

globalThis.IA = { P1_OVERUSE, HTML_ELEMENTS, HTML_ATTRS, htmlButtons, htmlIssues, cssIssues, htmlActionIssues, p1Share, p1Overuse, BUTTON_ACTIONS, FORMATS, RANGES, DEFAULTS, DEVICE_LIMIT, QUIET_DEFAULT, APP_SCREENS, SEGMENTS, REASONS, tokenIssues, resolveTokens, visibleLength, buttonCounter, contentIssues, validate, defaultEnd, transition, pct, invariantHolds, expiredTotal, closeOut };

// ---------- browser app ----------
if (typeof document === 'undefined' || !document.querySelector || !document.querySelector('#app') || !document.body || !document.body.dataset || document.body.dataset.app !== 'v7') return;

const KEY = 'sirrus-inapp-v11';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clone = o => JSON.parse(JSON.stringify(o));
const fmtN = n => Number(n || 0).toLocaleString('en-IN');
const toLocal = ms => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };
const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const fmtTime = ms => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const SAMPLE_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbd38d"/><stop offset="1" stop-color="#f6ad55"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="262" cy="40" r="20" fill="#fff7e0"/><rect x="40" y="58" width="70" height="122" fill="#2d3748"/><rect x="120" y="30" width="80" height="150" fill="#4a5568"/><rect x="210" y="80" width="70" height="100" fill="#2d3748"/><g fill="#fefcbf">' + Array.from({ length: 30 }, (_, i) => `<rect x="${130 + (i % 5) * 14}" y="${42 + Math.floor(i / 5) * 20}" width="7" height="9"/>`).join('') + '</g><text x="16" y="28" font-family="Segoe UI,Arial" font-size="16" font-weight="700" fill="#2d3748">Centralis, Baner</text></svg>');

const SAMPLE_HTML = `<section class="due">
  <img src="hero.webp" alt="Centralis tower">
  <h2>{{first_name | "Homebuyer"}}, your demand letter is due</h2>
  <p>The slab 6 payment for <strong>{{project_name | "your home"}}</strong> is due on 5 Oct.</p>
  <button data-sirrus-action="primary">Pay now</button>
  <button data-sirrus-action="dismiss">Later</button>
</section>`;
const SAMPLE_CSS = `.due { padding: 18px; font-family: system-ui, sans-serif; color: #1a202c; }
.due img { width: 100%; border-radius: 10px; }
.due h2 { font-size: 19px; margin: 12px 0 6px; }
.due p { font-size: 14px; color: #4a5568; }
.due button { display: block; width: 100%; padding: 12px; margin-top: 10px; border-radius: 10px; border: 0; font-size: 15px; }
.due button[data-sirrus-action="primary"] { background: #4f46e5; color: #fff; }
.due button[data-sirrus-action="dismiss"] { background: #edf2f7; color: #2d3748; }`;
function seed() {
  const now = Date.now();
  const diwaliContent = { format: 'modal', headline: '{{first_name | "Valued Homebuyer"}}, your Diwali 3BHK visit', body: 'Festive prices on Centralis 3BHK homes end 3 Nov. Book a site visit and meet {{rm_name | "your relationship manager"}} at the sample flat.', media: { mode: 'url', src: SAMPLE_IMG, ratio: '16:9', error: '' }, b1: { label: 'Book a visit', screen: '/book-visit' }, b2: { label: 'Maybe later', action: 'dismiss', screen: '' }, theme: { mode: 'light', color: '#4f46e5', radius: 'soft', dim: true }, bgTap: true, timeout: 8 };
  const base = { trigger: { type: 'event', event: 'Screen viewed', screen: '/project/centralis', n: 1 }, cap: 3, cooldown: 24, priority: 3, onlineCheck: false, triggerDelay: DEFAULTS.triggerDelay, inSessionSpacing: DEFAULTS.inSessionSpacing, startMode: 'schedule', pending: null };
  const pubStart = now - 44 * H;
  return {
    role: 'marketer', view: 'list', id: null, tab: 'analytics', mode: 'unique', version: 'all', showArchived: false, platform: 'android',
    demo: { screensDown: false, resultsDown: false },
    settings: { sdk: true, fatigue: DEFAULTS.fatigue, quiet: QUIET_DEFAULT.slice() },
    devices: [{ id: 'd1', name: 'QA Pixel 9', model: 'Pixel 9', platform: 'android' }, { id: 'd2', name: 'Meera iPhone', model: 'iPhone 16 Pro', platform: 'ios' }],
    seq: 10242, modelIdx: 0, tenantImpr7d: 5200, // demo: the tenant's in-app impressions over the last 7 days (IA05-15)
    campaigns: [
      { ...clone(base), id: 'IA-10231', name: 'Diwali 3BHK site visit', status: 'Ended', version: 1, segment: 's1', content: diwaliContent, cap: 2, start: '2025-10-31T10:00', end: '2025-11-03T23:59', createdOn: '2025-10-28T16:20', createdBy: 'Meera Kulkarni', updated: now,
        stats: { all: { eligible: 4120, shownU: 2380, shownT: 2800, clickedU: 410, clickedT: 410, dismissedU: 1050, dismissedT: 1285, still: 0,
          reasons: { optout: 8, noopen: 980, notrigger: 610, quiet: 12, transactional: 4, fatigue: 30, priority: 90, online: 0, offline: 6 },
          buttons: { b1: [410, 410], b2: [700, 620], x: [460, 390], back: [80, 70], bg: [45, 40], swipe: [0, 0], timeout: [1105, 940] },
          kpm: { engaged: 410 }, screens: [['/book-visit', 290, 352], ['/floor-plans', 74, 98], ['/cost-sheet', 38, 49]] } } },
      { ...clone(base), id: 'IA-10238', name: 'Centralis floor-plan nudge', status: 'Published', version: 2, segment: 's2', trigger: { type: 'event', event: 'Viewed floor plan', screen: '', n: 2 },
        content: { ...clone(diwaliContent), format: 'top', headline: 'Floor plans for {{project_name | "our new project"}}', body: 'See the 3BHK corner layout with the east deck.', media: { mode: 'none', src: '', ratio: '1:1', error: '' }, b1: { label: 'See layout', screen: '/floor-plans' }, b2: null },
        start: toLocal(pubStart), end: toLocal(defaultEnd(pubStart)), createdOn: toLocal(pubStart - 20 * H), createdBy: 'Pratik Wankhede', updated: now,
        stats: {
          all: { eligible: 1180, shownU: 610, shownT: 833, clickedU: 92, clickedT: 92, dismissedU: 140, dismissedT: 151, still: 570, reasons: {}, buttons: { b1: [92, 92], x: [110, 104], swipe: [41, 38], timeout: [590, 455] }, kpm: { engaged: 92 }, screens: [['/floor-plans', 82, 118], ['/cost-sheet', 7, 9]] },
          1: { eligible: 1180, shownU: 402, shownT: 520, clickedU: 51, clickedT: 51, dismissedU: 88, dismissedT: 95, still: null, reasons: {}, buttons: { b1: [51, 51], x: [70, 66], swipe: [25, 24], timeout: [374, 290] }, kpm: { engaged: 51 }, screens: [['/floor-plans', 46, 66], ['/cost-sheet', 4, 5]] },
          2: { eligible: 1180, shownU: 263, shownT: 313, clickedU: 41, clickedT: 41, dismissedU: 55, dismissedT: 56, still: null, reasons: {}, buttons: { b1: [41, 41], x: [40, 38], swipe: [16, 14], timeout: [216, 165] }, kpm: { engaged: 41 }, screens: [['/floor-plans', 36, 52], ['/cost-sheet', 3, 4]] } } },
      { ...clone(base), id: 'IA-10241', name: 'Price drop — Tower B', status: 'Draft', version: 0, segment: 's1', trigger: { type: 'open', event: '', screen: '', n: 1 },
        content: { ...clone(diwaliContent), format: 'drawer', headline: 'Tower B prices just dropped', body: 'Two-bedroom homes in Tower B are now ₹6 lakh lower. See the new cost sheet.', media: { mode: 'none', src: '', ratio: '16:9', error: '' }, b1: { label: 'See new prices', screen: '/offers/legacy' }, b2: null },
        startMode: 'now', start: toLocal(now), end: toLocal(defaultEnd(now)), createdOn: toLocal(now - 3 * H), createdBy: 'Pratik Wankhede', updated: now, stats: {} },
      { ...clone(base), id: 'IA-10240', name: 'Payment due: Centralis demand letter', status: 'Published', version: 1, segment: 's2', priority: 1, cap: 5, cooldown: 12, trigger: { type: 'open', event: '', screen: '', n: 1 }, p1Impr7d: 2080,
        content: { ...clone(diwaliContent), kind: 'html', format: 'modal', html: SAMPLE_HTML, css: SAMPLE_CSS, files: ['hero.webp'], htmlActions: { primary: { action: 'screen', screen: '/cost-sheet', url: '' } } },
        start: toLocal(pubStart), end: toLocal(defaultEnd(pubStart)), createdOn: toLocal(pubStart - 4 * H), createdBy: 'Meera Kulkarni', updated: now,
        stats: { all: { eligible: 900, shownU: 520, shownT: 2080, clickedU: 300, clickedT: 330, dismissedU: 150, dismissedT: 400, still: 380, reasons: {}, buttons: { b1: [330, 300], b2: [400, 150] }, kpm: { engaged: 300 }, screens: [['/cost-sheet', 296, 322]] } } },
    ],
  };
}

let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch (e) { S = seed(); }
let T = { edit: null, dirty: false, content: null, contentDirty: false, modal: null, refreshAt: Date.now(), seCheck: '' }; // transient
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: demo still works in-memory */ } };
const ctx = () => ({ name: (T.edit && T.edit.name) || '', role: S.role, now: Date.now(), screens: APP_SCREENS, quiet: S.settings.quiet, screensDown: S.demo.screensDown });
const camp = id => S.campaigns.find(c => c.id === id);
const seg = id => SEGMENTS.find(s => s.id === id);
const can = ev => ({ create: ['marketer', 'admin'], settings: ['admin'], devices: ['marketer', 'admin'] }[ev] || []).includes(S.role);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
function go(view, id) {
  if (view === 'setup' && !can('create')) return toast('Viewers can only see analytics.');
  S.view = view; if (id !== undefined) S.id = id; save(); render(); window.scrollTo(0, 0);
}

// ---------- phone preview ----------
function radius(r) { return { sharp: 4, soft: 14, round: 24 }[r] || 14; }
function actionLabel(b) { const a = b.action || 'screen'; return a === 'dismiss' ? 'Dismiss' : a === 'url' ? 'Opens ' + (b.url || 'a web link') : a === 'screen' ? 'Opens ' + (b.screen || 'a screen') : (BUTTON_ACTIONS.find(x => x[0] === a) || [, a])[1]; }
function htmlFrame(ct, opts = {}) { // IA02-16: rendered inside the format's container; sandbox runs no scripts
  const lead = opts.lead || null;
  const body = String(ct.html || '').replace(/>([^<]*)</g, (_, t) => '>' + resolveTokens(t, lead) + '<').replace(/src="([^"]+)"/g, (m, f) => (ct.files || []).includes(f) ? `src="${SAMPLE_IMG}"` : m);
  const big = opts.big ? 'body *{font-size:135%!important}' : '';
  const doc = `<!doctype html><html><head><style>body{margin:0}${ct.css || ''}${big}</style></head><body>${body}</body></html>`;
  return `<iframe class="ov-frame" sandbox="allow-same-origin" srcdoc="${esc(doc)}" title="Custom HTML preview"></iframe>`;
}
function overlayHTML(ct, opts = {}) {
  if (ct.kind === 'html') {
    const f = ct.format, close = `<span class="ov-x ${f === 'full' ? 'x48' : ''}" title="Sirrus close button">×</span>`;
    const inner = htmlIssues(ct).length ? '<div class="ov-copy"><p class="ph">Preview unavailable. Fix the content check first.</p></div>' : htmlFrame(ct, opts) + utmCaption(ct, opts);
    const cls = `ov ov-${f} light ov-html`;
    if (f === 'modal') return `<div class="scrim dim"><div class="${cls}">${close}${inner}</div></div>`;
    if (f === 'drawer') return `<div class="scrim light"><div class="${cls}"><i class="grab"></i>${inner}</div></div>`;
    return `<div class="${cls}">${close}${inner}</div>`;
  }
  const lead = opts.lead || null, th = ct.theme, f = ct.format;
  const hl = esc(resolveTokens(ct.headline, lead)) || '<span class="ph">Your headline</span>';
  const body = esc(resolveTokens(ct.body, lead));
  const imgOk = ct.media && ct.media.mode !== 'none' && ct.media.src && !ct.media.error;
  const img = imgOk ? `<img class="ov-img r${ct.media.ratio === '1:1' ? '11' : '169'}" src="${esc(ct.media.src)}" alt="">` : '';
  const btn = (b, i) => b ? `<button class="ov-btn ${i ? 'ghost' : ''}" title="${esc(actionLabel(b))}${opensSomething(b) && finalLink(b, opts.name != null ? opts.name : campName(), i ? 'button_2' : 'button_1') ? ' → ' + esc(finalLink(b, opts.name != null ? opts.name : campName(), i ? 'button_2' : 'button_1')) : ''}" style="${i ? `color:${th.color};border-color:${th.color}` : `background:${th.color}`}">${esc(resolveTokens(b.label, lead)) || 'Button ' + (i + 1)}</button>` : '';
  const btns = `<div class="ov-btns">${btn(ct.b1, 0)}${btn(ct.b2, 1)}</div>${utmCaption(ct, opts)}`;
  const close = `<span class="ov-x ${f === 'full' ? 'x48' : ''}" title="Close (${f === 'full' ? 48 : 44}px target)">×</span>`;
  const cls = `ov ov-${f} ${th.mode}${opts.big ? ' big' : ''}`, st = `--r:${radius(th.radius)}px`;
  if (f === 'modal') return `<div class="scrim ${th.dim ? 'dim' : ''}"><div class="${cls}" style="${st}">${close}${img}<div class="ov-copy"><h4>${hl}</h4>${body ? `<p>${body}</p>` : ''}${btns}</div></div></div>`;
  if (f === 'top' || f === 'bottom') return `<div class="${cls}" style="${st}">${close}${imgOk ? `<img class="ov-thumb" src="${esc(ct.media.src)}" alt="">` : ''}<div class="ov-copy"><h4>${hl}</h4>${body ? `<p>${body}</p>` : ''}${btns}</div>${f === 'top' ? `<i class="ov-timer" title="Hides after ${ct.timeout}s"></i>` : ''}</div>`;
  if (f === 'drawer') return `<div class="scrim light"><div class="${cls}" style="${st}"><i class="grab"></i>${img}<div class="ov-copy"><h4>${hl}</h4>${body ? `<p>${body}</p>` : ''}${btns}</div></div></div>`;
  return `<div class="${cls}">${close}${img}<div class="ov-copy"><h4>${hl}</h4>${body ? `<p>${body}</p>` : ''}${btns}</div></div>`;
}
function phoneHTML(ct, platform, opts = {}) {
  const ios = platform === 'ios';
  return `<div class="device ${ios ? 'ios' : 'android'}"><div class="screen">
    <div class="sb"><span>9:41</span>${ios ? '<i class="island"></i>' : '<i class="punch"></i>'}<span>▮▮ ◔ ▰</span></div>
    <div class="appbar"><b>Horizon Homes</b><span>☰</span></div>
    <div class="appbody"><div class="hero"><img src="${SAMPLE_IMG}" alt=""></div><h5>Centralis, Baner</h5><p class="meta">2, 3 & 4 BHK · ₹1.2 Cr onwards · RERA P5210004</p>
      <div class="chips"><span>Floor plans</span><span>Cost sheet</span><span>Amenities</span></div>
      <div class="rowcard"><b>3BHK Corner</b><span>1,420 sq ft · East deck</span></div><div class="rowcard"><b>2BHK Garden</b><span>1,050 sq ft · Private lawn</span></div></div>
    <div class="tabbar"><span>Home</span><span>Projects</span><span>Visits</span><span>Me</span></div>
    ${ct ? overlayHTML(ct, opts) : ''}
    ${ios ? '<i class="homebar"></i>' : '<i class="navpill"></i>'}
  </div></div><div class="device-cap">${ios ? 'iPhone 16 Pro' : 'Pixel 9'} · sample app screen</div>`;
}
function seCheck(ct) { // IA02-06 / IA02-16: iPhone SE width (375pt) with the real preview styles
  const probe = $('#se-probe'); if (!probe || !ct) return '';
  if (ct.kind === 'html') return !htmlIssues(ct).length && frameBelowFold(probe, ct, false) ? 'On iPhone SE this content scrolls, and Button 1 is below the fold.' : '';
  probe.innerHTML = `<div class="device ios se"><div class="screen">${overlayHTML(ct)}</div></div>`;
  const h = probe.querySelector('h4'); if (!h) return '';
  const lh = parseFloat(getComputedStyle(h).lineHeight); const lines = Math.round(h.getBoundingClientRect().height / lh);
  probe.innerHTML = '';
  return lines > 2 ? 'Headline wraps past 2 lines on iPhone SE.' : '';
}
function frameBelowFold(probe, ct, big) { // true when the primary button ends below the visible container
  probe.innerHTML = `<div class="device ios se"><div class="screen">${overlayHTML(ct, { big })}</div></div>`;
  const fr = probe.querySelector('iframe'); let res = false;
  if (fr) try { const d = fr.contentDocument; d.open(); d.write(fr.getAttribute('srcdoc')); d.close(); const b = d.querySelector('[data-sirrus-action="primary"]'); if (b) res = b.getBoundingClientRect().bottom > fr.clientHeight; } catch (e) { res = false; }
  probe.innerHTML = ''; return res;
}
function bigTextCheck(ct) { // IA02-17: largest phone text size
  const probe = $('#se-probe'); if (!probe || !ct) return '';
  const msg = 'At the largest text size Button 1 is below the fold. Buyers must scroll to reach it.';
  if (ct.kind === 'html') return !htmlIssues(ct).length && frameBelowFold(probe, ct, true) ? msg : '';
  probe.innerHTML = `<div class="device ios se"><div class="screen">${overlayHTML(ct, { big: true })}</div></div>`;
  const sc = probe.querySelector('.screen'), b = probe.querySelector('.ov-btn'); let r = false;
  if (b) r = b.getBoundingClientRect().bottom > sc.getBoundingClientRect().bottom;
  probe.innerHTML = ''; return r ? msg : '';
}

// ---------- shell ----------
function statusChip(s) { return `<span class="chip st-${s.toLowerCase()}">${s}</span>`; }
function render() {
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === (S.view === 'settings' ? 'settings' : 'campaigns')));
  $('#role').value = S.role;
  const c = camp(S.id);
  const crumbs = { list: 'In-App Campaigns', setup: `Campaigns <i>›</i> ${T.edit && T.edit.name ? esc(T.edit.name) : 'New campaign'} <i>›</i> <b>One-Time Campaign Setup</b>`, content: `Campaigns <i>›</i> ${T.edit && T.edit.name ? esc(T.edit.name) : 'New campaign'} <i>›</i> <b>Set up Content - In-App</b>`, analytics: `Campaigns <i>›</i> ${c ? esc(c.name) : ''} <i>›</i> <b>Campaign Analytics</b> <em>IA05-01</em>`, settings: '<b>In-app settings</b>' };
  $('#crumb').innerHTML = crumbs[S.view] || '';
  const views = { list: viewList, setup: viewSetup, content: viewContent, analytics: viewAnalytics, settings: viewSettings };
  if (S.view === 'setup' && !T.edit) S.view = 'list';
  if (S.view === 'content' && !T.content) S.view = T.edit ? 'setup' : 'list';
  if (S.view === 'analytics' && !c) S.view = 'list';
  $('#app').innerHTML = views[S.view]();
  $('#modal').innerHTML = T.modal ? modalHTML() : '';
  $('#modal').classList.toggle('on', !!T.modal);
  if (S.view === 'content') { const w = [seCheck(T.content), T.bigText ? bigTextCheck(T.content) : ''].filter(Boolean).join(' '); const el = $('#se-warn'); if (el) { el.textContent = w; el.hidden = !w; } }
}

// ---------- campaign list ----------
function actionsFor(c) {
  const b = [];
  const ok = ev => transition(c, ev, S.role, Date.now()).ok;
  if (c.status !== 'Draft' && c.status !== 'Scheduled') b.push(`<button data-act="open-analytics" data-id="${c.id}">Analytics</button>`);
  if (can('create') && ['Draft', 'Scheduled', 'Published', 'Paused'].includes(c.status)) b.push(`<button data-act="edit" data-id="${c.id}">${c.status === 'Draft' ? 'Edit' : c.status === 'Scheduled' ? 'Edit' : 'Edit (new version)'}</button>`);
  if (ok('cancel')) b.push(`<button data-act="tx" data-ev="cancel" data-id="${c.id}">Cancel schedule</button>`);
  if (ok('pause')) b.push(`<button data-act="tx" data-ev="pause" data-id="${c.id}">Pause</button>`);
  if (ok('resume')) b.push(`<button data-act="tx" data-ev="resume" data-id="${c.id}">Resume</button>`);
  if (ok('clone')) b.push(`<button data-act="clone" data-id="${c.id}">Clone</button>`);
  if (S.role === 'admin' && ['Scheduled', 'Published'].includes(c.status)) b.push(`<button class="danger" data-act="tx" data-ev="archive" data-id="${c.id}">Archive</button>`); // IA06-05: shows the block copy
  if (ok('archive')) b.push(`<button class="danger" data-act="tx" data-ev="archive" data-id="${c.id}">Archive</button>`);
  if (c.status === 'Scheduled') b.push(`<button class="demo" data-act="sys" data-ev="start" data-id="${c.id}">▶ Simulate start</button>`);
  if (['Published', 'Paused'].includes(c.status)) b.push(`<button class="demo" data-act="sys" data-ev="end" data-id="${c.id}">■ Simulate end</button>`);
  return b.join('');
}
function viewList() {
  const rows = S.campaigns.filter(c => S.showArchived || c.status !== 'Archived');
  return `<div class="page-head"><div><h1>In-App Campaigns</h1><p class="sub">One-Time and journey campaigns on the In-App channel. Journey campaigns start from + New overlay (SCR-IA-08); the journey canvas node panel (SCR-IA-04) is not in this prototype.</p></div>
    <div class="row">${can('create') ? '<button data-act="new-overlay">+ New overlay</button><button class="primary" data-act="new">+ Create campaign</button>' : '<span class="muted">Viewer: analytics only</span>'}</div></div>
    ${S.settings.sdk ? '' : '<div class="banner warn">No app is connected to Sirrus, so the In-App tile is disabled on new campaigns. Connect it in In-app settings.</div>'}
    <div class="card"><div class="card-head"><h3>Campaigns</h3><label class="inline"><input type="checkbox" data-act="toggle-archived" ${S.showArchived ? 'checked' : ''}> Show archived</label></div>
    <table class="tbl"><thead><tr><th>Campaign</th><th>Status</th><th>Format</th><th>Priority</th><th>Segment</th><th>Start → End</th><th>Version</th><th class="num">Shown</th><th></th></tr></thead><tbody>
    ${rows.map(c => { const st = c.stats && c.stats.all; return `<tr><td><button class="link" data-act="${c.status === 'Draft' || c.status === 'Scheduled' ? 'edit' : 'open-analytics'}" data-id="${c.id}">${esc(c.name)}</button><small>${c.id}${c.pending ? ' · <b class="pend">unpublished edits</b>' : ''}</small></td><td>${statusChip(c.status)}</td><td>${c.content ? FORMATS[c.content.format].name + (c.content.kind === 'html' ? '<br><small>Custom HTML</small>' : '') : '—'}</td><td class="nowrap">${c.priority}${p1Overuse(c, S.tenantImpr7d) ? ` <span class="chip warnchip" title="${Math.round(p1Share(c, S.tenantImpr7d) * 100)}% of your app's in-app impressions in the last 7 days came from this campaign at Priority 1. Priority 1 skips the fatigue limit, so keep it for must-see messages.">Priority 1 overuse</span>` : ''}</td><td>${c.journey ? '<small>Set by the journey</small>' : esc((seg(c.segment) || {}).name || '—')}</td><td class="nowrap">${c.startMode === 'now' && c.status === 'Draft' ? 'Now' : fmtDate(c.start)}<br><small>${fmtDate(c.end)}</small></td><td>${c.version ? 'v' + c.version : '—'}</td><td class="num">${st ? fmtN(st.shownU) : '—'}</td><td class="acts">${actionsFor(c)}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">No campaigns yet.</td></tr>'}
    </tbody></table></div>
    <p class="foot">Buttons marked ▶ / ■ stand in for the clock reaching Start or End (system transitions in §6.1).</p>`;
}

// ---------- SCR-IA-01 setup ----------
function newCampaign() {
  const now = Date.now();
  return { id: null, name: '', status: 'Draft', version: 0, segment: '', content: null, trigger: { type: 'open', event: '', screen: '', n: DEFAULTS.n }, cap: DEFAULTS.cap, cooldown: DEFAULTS.cooldown, priority: DEFAULTS.priority, onlineCheck: false, triggerDelay: DEFAULTS.triggerDelay, inSessionSpacing: DEFAULTS.inSessionSpacing, startMode: 'now', start: toLocal(now + H), end: toLocal(defaultEnd(now)), createdBy: 'Pratik Wankhede', stats: {}, pending: null, reachAt: null };
}
function field(id, label, inner, err, hint) {
  return `<div class="field" data-f="${id}"><label>${label} <em>${id}</em></label>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}${err ? `<div class="err">${esc(err)}</div>` : ''}</div>`;
}
function viewSetup() {
  const c = T.edit, cx = ctx(), issues = validate(c, cx), errOf = id => (issues.find(i => i.id === id) || {}).msg;
  const sg = seg(c.segment), orig = camp(c.id);
  const editingLive = orig && ['Published', 'Paused'].includes(orig.status);
  const tiles = [['WhatsApp', '✆'], ['Email', '✉'], ['SMS', '✎'], ['AI Calling', '☏'], ['RCS', '◈'], ['Push Notify', '🔔'], ['In-App', '▣']];
    const opt = (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label == null ? v : label)}</option>`;
  const num = (path, v, r) => `<input type="number" id="f-${path}" data-bind="${path}" data-num="1" min="${r[0]}" max="${r[1]}" value="${esc(v)}">`;
  return `<div class="page-head"><div><h1>One-Time Campaign Setup</h1><p class="sub">SCR-IA-01 · same page as other channels; picking In-App adds When to show, Display rules, and Start plus End.</p></div><div>${orig ? statusChip(orig.status) : statusChip('Draft')}</div></div>
  ${editingLive ? `<div class="banner info">Editing a live campaign creates draft <b>v${orig.version + 1}</b>. Buyers keep seeing v${orig.version} until you publish.</div>` : ''}
  <div class="split"><div class="stack">
  <section class="card"><h3>Select the Channel</h3><div class="tiles">${tiles.map(([n, i]) => { const ia = n === 'In-App'; const dis = ia && !S.settings.sdk; return `<button class="tile ${ia ? 'sel' : ''} ${dis ? 'dis' : ''}" data-act="tile" data-tile="${n}" ${dis ? 'aria-disabled="true" title="Connect your app to Sirrus to use In-App."' : ''}><span>${i}</span>${n}${ia ? '<em>IA01-01</em>' : ''}</button>`; }).join('')}</div>
    ${S.settings.sdk ? '' : '<div class="err">Connect your app to Sirrus to use In-App.</div>'}</section>
  <section class="card"><h3>Campaign details</h3>
    ${field('IA01-02', `Campaign Name <span class="count">${String(c.name).length}/50</span>`, `<input id="f-name" data-bind="name" maxlength="50" value="${esc(c.name)}" placeholder="e.g. Diwali 3BHK site visit">`, errOf('IA01-02'))}
    ${field('IA01-03', 'Segment', `<select id="f-segment" data-bind="segment">${opt('', c.segment, 'Select a segment')}${SEGMENTS.map(s => opt(s.id, c.segment, s.name)).join('')}</select>`, errOf('IA01-03'))}
    <div class="field" data-f="IA01-04"><label>Audience <em>IA01-04</em></label><div class="counts"><div><small>User Count</small><b>${sg ? fmtN(sg.users) : '—'}</b></div><div><small>Reachable User Count</small><b>${sg ? fmtN(sg.reach) : '—'}</b></div><button data-act="refresh-count" ${sg ? '' : 'disabled'}>↻ Refresh Count</button></div>
      <div class="hint">Reachable = segment members with the app, logged in at least once, not opted out.${c.reachAt ? ' Counted ' + fmtTime(c.reachAt) + '.' : ''}</div>
      ${sg && sg.reach === 0 ? '<div class="warnline">No one in this segment can see in-app messages yet.</div>' : ''}</div>
  </section>
  <section class="card"><h3>Content</h3>
    ${field('IA01-05', 'Choose Content', c.content ? `<div class="thumb-row"><div class="thumb">${phoneHTML(c.content, 'android')}</div><div><b>${FORMATS[c.content.format].name}</b><p class="muted">${esc(resolveTokens(c.content.headline))}</p><p class="muted">Buttons ${buttonCounter(c.content)}</p><button data-act="choose-content">Edit content</button></div></div>` : `<button class="wide" data-act="choose-content">+ Choose Content</button>`, errOf('IA01-05'))}
    ${c.content ? contentIssues(c.content, cx).map(i => `<div class="err">${esc(i.msg)}</div>`).join('') : ''}
  </section>
  <section class="card"><h3>When to show</h3>
    ${field('IA01-06', 'Trigger', `<div class="seg2"><label class="radio"><input type="radio" name="trig" data-bind="trigger.type" value="open" ${c.trigger.type === 'open' ? 'checked' : ''}> Next App Open</label><label class="radio"><input type="radio" name="trig" data-bind="trigger.type" value="event" ${c.trigger.type === 'event' ? 'checked' : ''}> Contextual In-App Event</label></div>
      ${c.trigger.type === 'event' ? `<div class="grid2"><div><small>Event</small><select id="f-trigger.event" data-bind="trigger.event">${opt('', c.trigger.event, 'Pick an event')}${EVENTS.map(e => opt(e, c.trigger.event)).join('')}</select></div><div><small>At least N times (1–10)</small>${num('trigger.n', c.trigger.n, RANGES.n)}</div></div>` : ''}`, errOf('IA01-06'), c.trigger.type === 'event' ? 'Counted from Start. Shows at the moment the buyer does it the Nth time.' : 'Shows the next time the buyer opens or returns to the app.')}
    ${c.trigger.type === 'event' && c.trigger.event === 'Screen viewed' ? field('IA01-07', 'Screen viewed', `<select id="f-trigger.screen" data-bind="trigger.screen">${opt('', c.trigger.screen, 'Pick a screen')}${APP_SCREENS.concat(S.settings.quiet).map(s => opt(s, c.trigger.screen, s + (S.settings.quiet.includes(s) ? ' (quiet)' : ''))).join('')}</select>`, errOf('IA01-07'), 'From the app\'s registered screen list.') : ''}
  </section>
  <section class="card"><h3>Display rules</h3>
    ${field('IA01-08', 'Frequency cap · Cooldown · Priority', `<div class="grid3"><div><small>Max times per person (1–5)</small>${num('cap', c.cap, RANGES.cap)}</div><div><small>Hours between showings (1–168)</small>${num('cooldown', c.cooldown, RANGES.cooldown)}</div><div><small>Priority, 1 = highest (1–5)</small>${num('priority', c.priority, RANGES.priority)}</div></div>`, errOf('IA01-08'), Number(c.priority) === 1 ? 'Priority 1 skips the app-wide fatigue limit. Keep it for must-see messages.' : 'When two overlays are ready at once, the one closer to 1 shows; ties go to the earlier-published campaign.')}
    ${field('IA01-10', 'Online check', `<label class="switch"><input type="checkbox" data-bind="onlineCheck" ${c.onlineCheck ? 'checked' : ''}><span></span> ${c.onlineCheck ? 'On' : 'Off'}</label>`, '', 'Confirms with Sirrus that the offer is still valid right before showing (waits up to 1.5s). Offline or no answer = not shown.')}
    ${field('IA01-16', 'Trigger delay (seconds) · In-session spacing', `<div class="grid2"><div><small>Trigger delay (0–60s)</small>${num('triggerDelay', c.triggerDelay == null ? 0 : c.triggerDelay, RANGES.triggerDelay)}</div><div><small>Spacing between overlays (0–600s)</small>${num('inSessionSpacing', c.inSessionSpacing == null ? 60 : c.inSessionSpacing, RANGES.inSessionSpacing)}</div></div>`, errOf('IA01-16') || errOf('IA01-17'), 'Delays popup on screen transition; prevents rapid overlay stacking within the same session.')}
    <div class="field ro" data-f="IA01-11"><label>App-wide rules <em>IA01-11</em></label><div class="rorow"><span>Fatigue limit</span><b>${S.settings.fatigue} overlay per 24h</b></div><div class="rorow"><span>Quiet screens</span><b>${S.settings.quiet.map(esc).join(', ')}</b></div>${S.role === 'admin' ? '<button class="link" data-act="nav-settings">Edit in In-app settings</button>' : '<div class="hint">Read-only. A Marketing Admin can change these.</div>'}</div>
  </section>
  <section class="card"><h3>Start and End</h3>
    ${field('IA01-14', 'Start', `<div class="seg2"><label class="radio"><input type="radio" name="sm" data-bind="startMode" value="now" ${c.startMode === 'now' ? 'checked' : ''}> Now</label><label class="radio"><input type="radio" name="sm" data-bind="startMode" value="schedule" ${c.startMode === 'schedule' ? 'checked' : ''}> Schedule</label></div>${c.startMode === 'schedule' ? `<input type="datetime-local" id="f-start" data-bind="start" value="${esc(c.start)}">` : ''}`, errOf('IA01-14'))}
    ${field('IA01-15', 'End', `<input type="datetime-local" id="f-end" data-bind="end" value="${esc(c.end)}"> <button class="link" data-act="end-default">Reset to Start + 72h</button>`, errOf('IA01-15'), 'Required. Up to 30 days after Start. The audience is fixed at Start.')}
  </section>
  <div class="footer-bar"><button data-act="setup-cancel">Cancel</button><div class="row"><button data-act="save-draft">Save as draft</button><button class="primary" data-act="publish" ${issues.length ? 'disabled' : ''}>Publish</button></div></div>
  </div>
  <aside class="side"><div class="card sticky"><h3>Ready to publish?</h3>
    ${issues.length ? `<p class="muted">Publish is off until these are fixed:</p><ul class="blockers">${issues.map(i => `<li><em>${i.id}</em>${esc(i.msg)}</li>`).join('')}</ul>` : `<p class="ok">✓ All checks pass. ${c.startMode === 'schedule' ? 'Publishing schedules it for ' + fmtDate(c.start) + '.' : 'Publishing starts it now.'}</p>`}
    <p class="hint">Save as draft is always available.</p>
    ${c.content ? `<div class="mini">${phoneHTML(c.content, S.platform)}</div>` : ''}
  </div></aside></div>`;
}

// ---------- SCR-IA-02 content ----------
function newContent() { return { kind: 'template', html: '', css: '', files: [], htmlActions: {}, format: 'modal', headline: '', body: '', media: { mode: 'none', src: '', ratio: '16:9', error: '' }, b1: { label: '', screen: '' }, b2: null, theme: { mode: 'light', color: '#4f46e5', radius: 'soft', dim: true }, bgTap: true, timeout: DEFAULTS.timeout, test: { devices: [], mode: 'default', lead: '' } }; }
function utmBlock(path, b, slot, n, issues, pname) { if (!opensSomething(b)) return ''; const v = utmVals(b, pname, slot), errs = issues.filter(i => i.id === 'IA02-18' && i.btn === n);
  const link = finalLink(b, pname, slot);
  return `<div class="utm" data-utm="${path}"><div class="utm-h">UTM tracking</div><div class="utm-grid">${UTM_KEYS.map(([k, l, req]) => `<div><small>${l}${req ? '' : ' (optional)'}</small><input id="f-${path}.utm.${k}" data-cbind="${path}.utm.${k}" value="${esc(v[k])}" placeholder="${req ? 'Required' : 'Empty'}"></div>`).join('')}</div>
    ${errs.map(e => `<div class="err">${esc(e.msg)}</div>`).join('')}
    <div class="hint">${b.action === 'url' ? 'Added to the link when the button is tapped. Any query string already in the URL stays, and a utm_ value already there is replaced by the value here.' : 'The same values travel with the deep link to the app screen. The SDK hands them to your app so its own analytics can read them, and adds them to the "Screen viewed" event for that screen. They also stay on later "Screen viewed" events in the same app session, until the session ends or a button from another campaign is tapped.'}</div>
    ${link ? `<div class="hint">Link: <code>${esc(link)}</code></div>` : ''}</div>`; }
function viewContent() {
  const ct = T.content, F = FORMATS[ct.format], [hl, bl, btl] = F.limits, cx = ctx();
  const pname = cx.name, issues = contentIssues(ct, cx), errOf = id => issues.filter(i => i.id === id).map(i => i.msg).join(' ');
  const cnt = (t, max) => { const n = visibleLength(t); return `<span class="count ${n > max ? 'over' : ''}">${n}/${max}</span>`; };
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label == null ? v : label)}</option>`;
  // §13 decision 32: what a button does is set here, never in the overlay content
  const actionSel = (k, cur, allowDismiss) => `<select id="f-${k}.action" data-cbind="${k}.action">${allowDismiss ? opt('dismiss', cur, 'Dismiss') : ''}${BUTTON_ACTIONS.map(([v, l]) => opt(v, cur, l)).join('')}</select>`;
  const actionDetail = (k, b) => { const a = b.action || 'screen'; return a === 'screen' ? screenSel(k + '.screen', b.screen) : a === 'url' ? `<input id="f-${k}.url" data-cbind="${k}.url" value="${esc(b.url || '')}" placeholder="https://…">` : ACTION_HINT[a] ? `<div class="hint">${ACTION_HINT[a]}</div>` : ''; };
  const screenSel = (path, cur) => `<select id="f-${path}" data-cbind="${path}">${opt('', cur, 'Screen Name')}${APP_SCREENS.map(s => opt(s, cur)).join('')}${cur && !APP_SCREENS.includes(cur) ? opt(cur, cur, cur + ' (not registered)') : ''}</select>`;
  const tokenMenu = target => `<select class="tok" data-act="token" data-target="${target}"><option value="">+ Personalise</option>${Object.keys(TOKENS).map(k => `<option value="${k}">${k}</option>`).join('')}</select>`;
  const t = ct.test || (ct.test = { devices: [], mode: 'default', lead: '' });
  return `<div class="page-head"><div><h1>Set up Content - In-App</h1><p class="sub">SCR-IA-02 · same layout as the push content page: stacked cards on the left, Live Template Preview on the right.</p></div></div>
  <div class="split"><div class="stack">
  <section class="card"><h3>Configure an In-App Overlay</h3><p class="muted">Shown inside the app while the buyer is using it. Pick a format, then write for that format's space.</p>
    ${field('IA02-01', 'Format', `<div class="formats">${Object.entries(FORMATS).map(([k, f]) => `<button class="fmt ${ct.format === k ? 'sel' : ''}" data-act="format" data-f="${k}"><i class="ico ico-${k}"><b></b></i>${f.name}<small>${f.limits.join(' / ')}</small></button>`).join('')}</div>`, errOf('IA02-01'), F.hint + ' Limits: headline / body / button characters.')}
    ${ct.format === 'top' ? field('IA02-01', 'Time-out (seconds, 4–15)', `<input type="number" id="f-timeout" data-cbind="timeout" data-num="1" min="4" max="15" value="${esc(ct.timeout)}">`, '', 'Default 8s.') : ''}
    ${ct.format === 'modal' ? `<label class="inline"><input type="checkbox" data-cbind="bgTap" ${ct.bgTap ? 'checked' : ''}> Close on background tap</label>` : ''}
    ${field('IA02-10', 'Content type', `<div class="seg2"><label class="radio"><input type="radio" name="kind" data-cbind="kind" value="template" ${ct.kind !== 'html' ? 'checked' : ''}> Built-in template</label><label class="radio"><input type="radio" name="kind" data-cbind="kind" value="html" ${ct.kind === 'html' ? 'checked' : ''}> Custom HTML</label></div>`, '', ct.kind === 'html' ? 'Custom HTML replaces the Message, Media, Buttons and Theme cards. Only a Marketing Admin can publish it.' : "Write into the format's fields, or switch to Custom HTML for agency-built content.")}
  </section>
  ${ct.kind === 'html' ? htmlCards(ct, issues) : `
  <section class="card"><h3>Message</h3>
    ${field('IA02-02', `Headline ${cnt(ct.headline, hl)}`, `<div class="tokrow"><input id="f-headline" data-cbind="headline" value="${esc(ct.headline)}" placeholder="Required">${tokenMenu('headline')}</div>`, issues.filter(i => i.id === 'IA02-02' && /Headline|headline/.test(i.msg)).map(i => i.msg).join(' '))}
    ${field('IA02-02', `Body (optional) ${cnt(ct.body, bl)}`, `<div class="tokrow"><textarea id="f-body" data-cbind="body" rows="3">${esc(ct.body)}</textarea>${tokenMenu('body')}</div>`, issues.filter(i => /^Body/.test(i.msg)).map(i => i.msg).join(' '), 'Tokens count as their default value. Format: {{first_name | "Valued Homebuyer"}}')}
    ${issues.some(i => i.id === 'CMO-2.3') ? '<div class="err">All dynamic tokens require a default fallback value.</div>' : ''}
  </section>
  <section class="card"><h3>Media</h3>
    ${field('IA02-03', 'Image', `<div class="seg3">${[['none', 'No image'], ['url', 'Image URL'], ['upload', 'Upload']].map(([v, l]) => `<label class="radio"><input type="radio" name="media" data-act="media-mode" value="${v}" ${ct.media.mode === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      ${ct.media.mode === 'url' ? `<input id="f-media.src" data-act="media-url" value="${esc(ct.media.src.startsWith('data:') ? '' : ct.media.src)}" placeholder="https://…">` : ''}
      ${ct.media.mode === 'upload' ? `<input type="file" data-act="media-file">${ct.media.src ? '<div class="hint">Uploaded.</div>' : ''}` : ''}
      ${ct.media.mode !== 'none' ? `<div class="seg2"><label class="radio"><input type="radio" name="ratio" data-cbind="media.ratio" value="16:9" ${ct.media.ratio === '16:9' ? 'checked' : ''}> 16:9</label><label class="radio"><input type="radio" name="ratio" data-cbind="media.ratio" value="1:1" ${ct.media.ratio === '1:1' ? 'checked' : ''}> 1:1</label></div>` : ''}`, errOf('IA02-03'), ct.media.mode !== 'none' ? 'If the image fails to load on the phone, the overlay shows text only.' : '')}
  </section>
  <section class="card"><div class="card-head"><h3>Buttons</h3><span class="muted">Up to 2 · ${buttonCounter(ct)}</span></div>
    ${field('IA02-04', `Button 1 ${cnt(ct.b1.label, btl)}`, `<div class="grid2"><input id="f-b1.label" data-cbind="b1.label" value="${esc(ct.b1.label)}" placeholder="Label">${actionSel('b1', ct.b1.action || 'screen', false)}</div>${actionDetail('b1', ct.b1)}${utmBlock('b1', ct.b1, 'button_1', 1, issues, pname)}`, errOf('IA02-04') || issues.filter(i => i.id === 'CMO-2.5' && /Button 1/.test(i.msg)).map(i => i.msg).join(''))}
    ${ct.b2 ? field('IA02-05', `Button 2 ${cnt(ct.b2.label, btl)} <button class="link" data-act="remove-b2">Remove</button>`, `<div class="grid2"><input id="f-b2.label" data-cbind="b2.label" value="${esc(ct.b2.label)}" placeholder="Label">${actionSel('b2', ct.b2.action, true)}</div>${actionDetail('b2', ct.b2)}${utmBlock('b2', ct.b2, 'button_2', 2, issues, pname)}`, errOf('IA02-05') || issues.filter(i => i.id === 'CMO-2.5' && /Button 2/.test(i.msg)).map(i => i.msg).join('')) : `<button data-act="add-b2">+ Add Button</button>`}
    ${S.demo.screensDown ? `<div class="err">Couldn't check deep links right now. Try again.</div>` : ''}
  </section>
  <section class="card"><h3>Theme</h3><div class="grid4">
    <div><small>Mode</small><select data-cbind="theme.mode">${opt('light', ct.theme.mode, 'Light')}${opt('dark', ct.theme.mode, 'Dark')}</select></div>
    <div><small>Button colour</small><input type="color" data-cbind="theme.color" value="${esc(ct.theme.color)}"></div>
    <div><small>Corner radius</small><select data-cbind="theme.radius">${opt('sharp', ct.theme.radius, 'Sharp')}${opt('soft', ct.theme.radius, 'Soft')}${opt('round', ct.theme.radius, 'Round')}</select></div>
    <div><small>Background dim</small><label class="inline"><input type="checkbox" data-cbind="theme.dim" ${ct.theme.dim ? 'checked' : ''}> Dim the app</label></div></div>
    <div class="hint">Background dim applies to Centered Modal; the drawer always uses a light dim.</div>
  </section>`}
  <section class="card"><h3>Send Test Message</h3>
    ${S.devices.length ? field('IA02-07', 'Test devices', `<div class="checks">${S.devices.map(d => `<label class="inline"><input type="checkbox" data-act="test-dev" value="${d.id}" ${t.devices.includes(d.id) ? 'checked' : ''}> ${esc(d.name)} <small>${esc(d.model)}</small></label>`).join('')}</div>${can('devices') ? '<button class="link" data-act="add-device">+ Add device</button>' : ''}`, T.testErr === 'dev' ? 'Pick a test device.' : '')
      : `<div class="empty-sm">No test devices yet. ${can('devices') ? '<button data-act="add-device">Add device</button>' : ''}</div>`}
    ${field('IA02-08', 'Personalization', `<div class="seg2"><label class="radio"><input type="radio" name="pm" data-act="test-mode" value="default" ${t.mode === 'default' ? 'checked' : ''}> Default values</label><label class="radio"><input type="radio" name="pm" data-act="test-mode" value="lead" ${t.mode === 'lead' ? 'checked' : ''}> As a buyer</label></div>${t.mode === 'lead' ? `<select data-act="test-lead"><option value="">Pick a lead</option>${LEADS.map(l => `<option value="${l.id}" ${t.lead === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` : ''}`, T.testErr === 'lead' ? 'Pick a lead to personalise the test.' : '')}
    <div class="row">${field('IA02-09', '', `<button data-act="send-test">Send test</button>`, '', 'Tests never count in analytics. Button links carry the same UTMs, with utm_source=sirrus_test.')}</div>
    ${T.testSent ? `<div class="okline">Sent. It shows on the next app open.</div><div class="hint">Resolved headline on the phone: “${esc(T.testSent)}”</div>${utmLinks(ct, pname, true).map(([n, l]) => `<div class="hint">Button ${n} test link: <code>${esc(l)}</code></div>`).join('')}` : ''}
  </section>
  ${journeyFooter(ct, cx)}
  </div>
  <aside class="side"><div class="card sticky"><div class="card-head"><h3>Live Template Preview <em>IA02-06</em></h3><div class="pill-toggle"><button class="${S.platform === 'android' ? 'sel' : ''}" data-act="platform" data-p="android">Android</button><button class="${S.platform === 'ios' ? 'sel' : ''}" data-act="platform" data-p="ios">iOS</button></div></div>
    <div id="phone-slot">${phoneHTML(ct, S.platform, { big: T.bigText })}</div>
    <label class="inline"><input type="checkbox" data-act="bigtext" ${T.bigText ? 'checked' : ''}> Preview at the largest text size <em>IA02-17</em></label>
    <div id="se-warn" class="warnline" hidden></div>
    <p class="hint center">Tokens show their default values. ${ct.format === 'top' ? `Hides after ${esc(ct.timeout)}s.` : ''}</p>
  </div></aside></div>`;
}

function journeyFooter(ct, cx) { // SCR-IA-02 footer: journey campaigns get Save (stay) + Publish
  if (!(T.edit && T.edit.journey)) return '<div class="footer-bar"><button data-act="content-cancel">Cancel</button><button class="primary" data-act="content-save">Save</button></div>';
  const v = validate({ ...T.edit, content: ct }, cx);
  return `<div class="footer-bar"><button data-act="content-cancel">Cancel</button><div class="row"><button data-act="content-save">Save</button><button class="primary" data-act="journey-publish" ${v.length ? `disabled title="${esc(v[0].msg)}"` : ''}>Publish</button></div></div>
    ${v.length ? `<div class="err">${esc(v[v.length - 1].id === 'IA01-05' ? v[v.length - 1].msg : v[0].msg)}</div>` : ''}`;
}
function htmlCards(ct, issues) { // IA02-11 to IA02-15
  const bs = htmlButtons(ct.html), map = ct.htmlActions || (ct.htmlActions = {});
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label == null ? v : label)}</option>`;
  const actRow = k => { const b = map[k] || (map[k] = { action: 'screen', screen: '', url: '' }), a = b.action || 'screen';
    return `<div class="grid2"><select id="f-ha-${k}" data-cbind="htmlActions.${k}.action">${BUTTON_ACTIONS.map(([v, l]) => opt(v, a, l)).join('')}</select>${a === 'screen' ? `<select id="f-ha-${k}-s" data-cbind="htmlActions.${k}.screen">${opt('', b.screen, 'Screen Name')}${APP_SCREENS.map(x => opt(x, b.screen)).join('')}</select>` : a === 'url' ? `<input id="f-ha-${k}-u" data-cbind="htmlActions.${k}.url" value="${esc(b.url || '')}" placeholder="https://…">` : `<div class="hint">${ACTION_HINT[a] || ''}</div>`}</div>${utmBlock('htmlActions.' + k, b, k === 'primary' ? 'button_1' : 'button_2', k === 'primary' ? 1 : 2, issues, campName())}`; };
  const btnErr = n => issues.filter(x => x.btn === n && x.id !== 'IA02-18').map(x => x.msg).join(' ');
  const contentErrs = issues.filter(x => !x.btn);
  return `<section class="card"><h3>HTML / Asset Bundle</h3>
    ${field('IA02-11', 'HTML', `<div class="row"><label class="btnlike">Upload .html file<input type="file" accept=".html,text/html" data-act="html-file" hidden></label><button data-act="zip-sample">Upload .zip bundle</button>${(ct.files || []).length ? `<span class="muted">Bundle files: ${ct.files.map(esc).join(', ')}</span>` : ''}</div>
      <textarea id="f-html" class="code" data-cbind="html" rows="10" spellcheck="false" placeholder="<section>…</section>">${esc(ct.html)}</textarea>`, '', "A body fragment only. Allowed: section, div, p, h1 to h3, span, strong, em, button, br, ul, ol, li, and img (files in the bundle). Scripts aren't allowed. Sirrus handles button taps and closing.")}
    ${T.htmlNotice ? `<div class="okline">${esc(T.htmlNotice)}</div>` : ''}
    ${field('IA02-12', 'CSS', `<textarea id="f-css" class="code" data-cbind="css" rows="6" spellcheck="false">${esc(ct.css)}</textarea>`, (cssIssues(ct.css)[0] || {}).msg, 'Plain rules only. No @ rules, url(), backslash escapes or HTML.')}
    <div class="field" data-f="IA02-13"><label>Content check <em>IA02-13</em></label>${contentErrs.length ? `<ul class="blockers">${contentErrs.map(x => `<li><em>${x.id}</em> ${esc(x.msg)}</li>`).join('')}</ul>` : '<div class="okline">Content passes. Set the button screens below.</div>'}</div>
  </section>
  <section class="card"><h3>Buttons</h3>
    <div class="field" data-f="IA02-14"><label>Buttons found in the HTML <em>IA02-14</em></label>${bs.length ? `<table class="tbl"><thead><tr><th>Text</th><th>Action</th><th>Counts as</th></tr></thead><tbody>${bs.map(b => `<tr><td>${esc(b.text) || '—'}</td><td><code>${esc(b.action || 'missing')}</code></td><td>${b.action === 'primary' ? 'Button 1' : ['secondary', 'dismiss'].includes(b.action) ? 'Button 2' : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">No buttons in the HTML yet.</div>'}</div>
    ${bs.some(b => b.action === 'primary') ? field('IA02-15', 'Button 1 (primary) action', actRow('primary'), btnErr(1)) : ''}
    ${bs.some(b => b.action === 'secondary') ? field('IA02-15', 'Button 2 (secondary) action', actRow('secondary'), btnErr(2)) : ''}
    ${bs.some(b => b.action === 'dismiss') ? '<div class="hint">The dismiss button closes the overlay. It needs no action.</div>' : ''}
    <div class="hint">Where a button goes is set here, never in the HTML.</div>
  </section>`;
}

// ---------- SCR-IA-03 add test device (modal) ----------
function qrSVG(seedStr) {
  let h = 0; for (const ch of seedStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  let cells = ''; const n = 25;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const finder = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
    if (finder) { const fx = x > 17 ? x - 18 : x, fy = y > 17 ? y - 18 : y; if (fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx > 1 && fx < 5 && fy > 1 && fy < 5)) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }
    else if (rnd() > 0.52) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg class="qr" viewBox="-2 -2 29 29"><rect x="-2" y="-2" width="29" height="29" fill="#fff"/>${cells}</svg>`;
}
function modalHTML() {
  const m = T.modal;
  if (m.type === 'confirm') return `<div class="dlg"><h3>${esc(m.title)}</h3><p>${esc(m.body)}</p><div class="row end"><button data-act="modal-close">Keep editing</button><button class="primary ${m.danger ? 'dangerbg' : ''}" data-act="modal-ok">${esc(m.ok)}</button></div></div>`;
  if (m.type === 'overlay') return `<div class="dlg"><div class="card-head"><h3>New overlay <em>SCR-IA-08</em></h3><button class="link" data-act="modal-close">✕</button></div>
    ${field('IA08-01', 'Campaign Name', `<input id="ov-name" data-act="ov-name" maxlength="50" value="${esc(m.name)}" placeholder="e.g. Tower B site-visit nudge">`, m.err ? 'Enter a campaign name.' : '')}
    ${field('IA08-02', 'Format', `<select data-act="ov-format">${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${m.format === k ? 'selected' : ''}>${f.name}</option>`).join('')}</select>`)}
    ${field('IA08-03', 'Content type', `<div class="seg2"><label class="radio"><input type="radio" name="ovk" data-act="ov-kind" value="template" ${m.kind === 'template' ? 'checked' : ''}> Built-in template</label><label class="radio"><input type="radio" name="ovk" data-act="ov-kind" value="html" ${m.kind === 'html' ? 'checked' : ''}> Custom HTML</label></div>`)}
    <p class="hint">Creates a journey campaign as Draft version 1 and opens Set up Content. The journey decides who sees it and when.</p>
    <div class="row end"><button data-act="modal-close">Cancel</button><button class="primary" data-act="ov-create">Create</button></div></div>`;
  const full = S.devices.length >= DEVICE_LIMIT;
  return `<div class="dlg wide"><div class="card-head"><h3>Add test device <em>SCR-IA-03</em></h3><button class="link" data-act="modal-close">✕</button></div>
    ${full ? `<div class="err">Your team has ${S.devices.length} test devices, the limit. Remove one or ask Sirrus support to raise it.</div>`
      : m.expired ? `<div class="qrbox expired">${qrSVG(m.code)}<div><b>This code expired. Close and add again.</b></div></div>`
      : `<div class="qrbox">${qrSVG(m.code)}<div><p>Open your phone camera and scan. Your app opens and registers this phone.</p><div class="row"><button class="demo" data-act="sim-scan">▶ Simulate scan</button><button class="demo" data-act="sim-expire">▶ Simulate code expiry</button></div></div></div>`}
    ${m.added ? `<div class="okline">${esc(m.added)} added.</div>` : ''}
    <h4>Registered devices <span class="muted">${S.devices.length}/${DEVICE_LIMIT}</span></h4>
    ${deviceList()}
    <div class="row end"><button class="primary" data-act="modal-close">Done</button></div></div>`;
}
function deviceList() {
  if (!S.devices.length) return '<div class="empty-sm">No test devices yet.</div>';
  return `<ul class="devlist">${S.devices.map(d => `<li><span class="plat">${d.platform === 'ios' ? 'iOS' : 'Android'}</span>${T.renaming === d.id ? `<input id="ren-${d.id}" data-act="rename-input" data-id="${d.id}" value="${esc(d.name)}"><button data-act="rename-save" data-id="${d.id}">Save</button>` : `<b>${esc(d.name)}</b><small>${esc(d.model)}</small>${can('devices') ? `<button class="link" data-act="rename" data-id="${d.id}">Rename</button><button class="link danger" data-act="remove-dev" data-id="${d.id}">Remove</button>` : ''}`}</li>`).join('')}</ul>`;
}

// ---------- SCR-IA-05 analytics ----------
function viewAnalytics() {
  const c = camp(S.id), live = ['Published', 'Paused'].includes(c.status);
  const st = c.stats && c.stats[S.version === 'all' ? 'all' : S.version];
  const U = S.mode === 'unique';
  const head = `<div class="an-head card"><div class="an-title"><span class="chan">▣</span><div><h1 class="h2">${esc(c.name)}</h1><div class="meta-row"><span>Campaign ID <b>${c.id}</b></span><span>Channel <b>In-App</b></span><span>Created On <b>${fmtDate(c.createdOn)}</b></span><span>Created By <b>${esc(c.createdBy)}</b></span>${statusChip(c.status)}<em>IA05-02</em></div></div></div>
    <div class="an-right"><span class="muted">Updated ${fmtTime(T.refreshAt)}</span><button data-act="refresh">↻ Refresh</button></div></div>
    <div class="tabs"><button class="${S.tab === 'analytics' ? 'sel' : ''}" data-act="tab" data-t="analytics">Analytics</button><button class="${S.tab === 'preview' ? 'sel' : ''}" data-act="tab" data-t="preview">Preview</button>
      <div class="tabs-right"><em>IA05-03</em><select data-act="version"><option value="all">All versions</option>${Array.from({ length: c.version }, (_, i) => `<option value="${i + 1}" ${String(S.version) === String(i + 1) ? 'selected' : ''}>Version ${i + 1}</option>`).join('')}</select>
      ${S.tab === 'analytics' ? `<div class="pill-toggle"><button class="${!U ? 'sel' : ''}" data-act="mode" data-m="total">Total</button><button class="${U ? 'sel' : ''}" data-act="mode" data-m="unique">Unique</button></div><em>IA05-04</em>` : ''}</div></div>`;
  if (S.tab === 'preview') return head + `<div class="card center-card">${c.content ? phoneHTML(c.content, S.platform) : 'No content.'}<div class="pill-toggle mt"><button class="${S.platform === 'android' ? 'sel' : ''}" data-act="platform" data-p="android">Pixel 9</button><button class="${S.platform === 'ios' ? 'sel' : ''}" data-act="platform" data-p="ios">iPhone 16 Pro</button></div><p class="hint">IA05-14 · ${S.version === 'all' ? 'latest version' : 'version ' + S.version}. Older versions' content is not stored in this prototype.</p></div>`;
  if (!st) return head + `<div class="card empty">No results yet. Results appear once the campaign starts.</div>`;
  const err = S.demo.resultsDown ? `<div class="banner err">Couldn't load results. Refresh to try again. <span class="muted">Showing numbers from ${fmtTime(T.refreshAt)}.</span></div>` : '';
  const shown = U ? st.shownU : st.shownT, clicked = U ? st.clickedU : st.clickedT, dism = U ? st.dismissedU : st.dismissedT;
  const tile = (id, label, v, sub, people) => `<div class="tile-m"><small>${label} <em>${id}</em></small><b>${v}</b><span>${sub}</span>${people ? '<i class="people">people</i>' : ''}</div>`;
  const tiles = `<div class="tiles-m">${tile('IA05-05', 'Eligible', fmtN(st.eligible), '&nbsp;', true)}${tile('IA05-06', 'Shown', fmtN(shown), pct(shown, st.eligible) + ' of Eligible')}${tile('IA05-07', 'Clicked', fmtN(clicked), pct(clicked, shown) + ' of Shown')}${tile('IA05-08', 'Dismissed', fmtN(dism), pct(dism, shown) + ' of Shown')}</div>`;
  const steps = [['Eligible', st.eligible], ['Shown', st.shownU], ['Clicked', st.clickedU]];
  const funnel = `<div class="card"><h3>In-App Funnel <em>IA05-10</em></h3><table class="tbl"><thead><tr><th>Step</th><th class="num">People</th><th class="num">% of previous step</th><th></th></tr></thead><tbody>${steps.map(([l, v], i) => `<tr><td>${l}</td><td class="num">${fmtN(v)}</td><td class="num">${i === 0 ? '—' : pct(v, steps[i - 1][1])}</td><td class="barcell"><i style="width:${!st.eligible ? 0 : Math.max(1, v / st.eligible * 100)}%"></i></td></tr>`).join('')}</tbody></table><div class="hint">Funnel steps are people in both modes. No Cost column for In-App.</div></div>`;
  let why;
  if (S.version !== 'all') why = `<div class="card"><h3>Why not shown <em>IA05-11</em></h3><p class="muted">Counted across the whole campaign. Pick All versions to see it.</p></div>`;
  else {
    const isHtml = c.content && c.content.kind === 'html';
    const rows = REASONS.filter(([k, , , only]) => (k !== 'still' || live) && (only !== 'html' || isHtml)).map(([k, l, m]) => [l, m, k === 'still' ? st.still : (st.reasons[k] || 0)]);
    const ok = invariantHolds(st);
    why = `<div class="card"><h3>Why not shown <em>IA05-11</em></h3><table class="tbl"><thead><tr><th>Reason</th><th>What it means</th><th class="num">People</th></tr></thead><tbody>${rows.map(([l, m, v]) => `<tr><td>${l}</td><td class="muted">${m}</td><td class="num">${fmtN(v)}</td></tr>`).join('')}</tbody></table>
      <div class="inv ${ok ? 'ok' : 'bad'}">Eligible ${fmtN(st.eligible)} = Shown ${fmtN(st.shownU)} + Expired ${fmtN(expiredTotal(st))} + Still eligible ${fmtN(st.still || 0)} ${ok ? '✓' : '✗ does not add up'}</div>
      <div class="hint">Each never-shown person is counted once, under the last reason that held them back.${live ? ' Expired reasons are assigned when the campaign ends.' : ''}</div></div>`;
  }
  const hb = c.content && c.content.kind === 'html' ? htmlButtons(c.content.html) : null, hp = hb && hb.find(b => b.action === 'primary'), hs = hb && hb.find(b => b.action !== 'primary');
  const btnRows = BUTTON_ROWS.filter(([k]) => k !== 'b2' || (hb ? hs : c.content && c.content.b2)).map(([k, l]) => { const v = st.buttons[k] || [0, 0]; const lbl = hb ? (k === 'b1' ? `Button 1 · ${esc(resolveTokens(hp ? hp.text : ''))}` : k === 'b2' ? `Button 2 · ${esc(resolveTokens(hs.text))}${hs.action === 'dismiss' ? ' <small>(dismiss)</small>' : ''}` : l) : k === 'b1' ? `Button 1 · ${esc(resolveTokens(c.content.b1.label))}` : k === 'b2' ? `Button 2 · ${esc(resolveTokens(c.content.b2.label))}${c.content.b2.action === 'dismiss' ? ' <small>(dismiss)</small>' : ''}` : l; return `<tr><td>${lbl}</td><td class="num">${fmtN(v[0])}</td><td class="num">${fmtN(v[1])}</td><td class="num">${pct(v[1], st.shownU)}</td></tr>`; });
  const buttons = `<div class="card"><h3>Button breakdown <em>IA05-12</em></h3><table class="tbl"><thead><tr><th>Action</th><th class="num">Total</th><th class="num">Unique</th><th class="num">% of Shown (unique)</th></tr></thead><tbody>${btnRows.join('')}</tbody></table></div>`;
  const scr = (st.screens || []).slice().sort((a, b) => (U ? b[1] - a[1] : b[2] - a[2]));
  const screens = `<div class="card"><h3>Screens reached <em>IA05-19</em></h3>${scr.length ? `<table class="tbl"><thead><tr><th>Screen</th><th class="num">${U ? 'People (unique)' : 'Views (total)'}</th></tr></thead><tbody>${scr.map(r => `<tr><td><code>${esc(r[0])}</code></td><td class="num">${fmtN(U ? r[1] : r[2])}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No app screens reached from this campaign yet.</p>'}<div class="hint">Screens app users opened from this campaign's buttons, counted from "Screen viewed" events that carry its UTM values. ${U ? 'Each person is counted once per screen.' : 'Every view is counted.'}</div></div>`;
  const k = st.kpm;
  const kpm = `<div class="card"><h3>Key Performance Metrics <em>IA05-13</em></h3><div class="kpm">${[['User Engaged', k.engaged]].map(([l, v]) => `<div><small>${l}</small><b>${fmtN(v)}</b></div>`).join('')}</div></div>`;
  const note = c.id === 'IA-10231' ? '<p class="foot">Headline numbers (4,120 / 2,380 / 410 / 1,050; 980 / 610 / 90; buttons 410 / 620 / 390) are from the PRD §4B walkthrough. The rest of the split is illustrative.</p>' : '<p class="foot">Illustrative numbers.</p>';
  const share = p1Share(c, S.tenantImpr7d);
  const p1 = c.priority == 1 ? `<div class="card"><h3>Priority 1 share <em>IA05-15</em></h3><p>Priority 1 share of your app's in-app impressions, last 7 days: <b>${(Math.round(share * 1000) / 10).toFixed(1)}%</b> ${share > P1_OVERUSE ? '<span class="chip warnchip">Priority 1 overuse</span>' : ''}</p><div class="hint">The overuse badge shows above ${Math.round(P1_OVERUSE * 100)}% (§8). It is a warning only; nothing is blocked.</div></div>` : '';
  return head + err + tiles + p1 + `<div class="grid-an">${funnel}${why}</div><div class="grid-an">${buttons}${kpm}</div><div class="grid-an">${screens}</div>` + note;
}

// ---------- In-app settings ----------
function viewSettings() {
  const ed = can('settings');
  const quietOpts = APP_SCREENS.concat(QUIET_DEFAULT).filter(s => !S.settings.quiet.includes(s));
  return `<div class="page-head"><div><h1>In-app settings</h1><p class="sub">App-wide rules for every In-App campaign. ${ed ? 'You can edit these as Marketing Admin.' : 'Read-only. Only a Marketing Admin can change these.'}</p></div></div>
  <div class="split"><div class="stack">
  <section class="card"><h3>App connection</h3><label class="switch"><input type="checkbox" data-act="sdk" ${S.settings.sdk ? 'checked' : ''} ${ed ? '' : 'disabled'}><span></span> ${S.settings.sdk ? 'Horizon Homes app connected (Android + iOS)' : 'No app connected'}</label><div class="hint">Demo switch. With no connected app the In-App tile is disabled.</div></section>
  <section class="card"><h3>Fatigue limit</h3><div class="row"><input type="number" class="w80" id="f-fatigue" data-act="fatigue" min="1" max="5" value="${S.settings.fatigue}" ${ed ? '' : 'disabled'}><span>overlays per person per 24h (1–5)</span></div>${T.fatErr ? `<div class="err">${T.fatErr}</div>` : ''}<div class="hint">Across all campaigns. Priority 1 campaigns skip it.</div></section>
  <section class="card"><h3>Quiet screens</h3><p class="muted">Overlays never show on these screens.</p><div class="chips-e">${S.settings.quiet.map(s => `<span class="qchip">${esc(s)}${ed ? `<button data-act="quiet-rm" data-s="${esc(s)}" title="Remove">×</button>` : ''}</span>`).join('')}</div>
    ${ed && quietOpts.length ? `<div class="row mt"><select id="quiet-add">${quietOpts.map(s => `<option>${esc(s)}</option>`).join('')}</select><button data-act="quiet-add">Add</button></div>` : ''}</section>
  <section class="card"><div class="card-head"><h3>Test devices</h3><span class="muted">${S.devices.length}/${DEVICE_LIMIT}</span></div>${deviceList()}${can('devices') ? '<button data-act="add-device">+ Add device</button>' : ''}</section>
  </div><aside class="side"><div class="card"><h3>Registered app screens</h3><p class="muted">From the app's screen list. Buttons can only link here.</p><ul class="plain">${APP_SCREENS.map(s => `<li><code>${s}</code></li>`).join('')}</ul></div></aside></div>`;
}

// ---------- events ----------
function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach(k => o = o[k] || (o[k] = {})); o[ks[ks.length - 1]] = v; }
function keepFocus(fn) {
  const a = document.activeElement, id = a && a.id, s = a && a.selectionStart, e = a && a.selectionEnd;
  fn();
  if (id) { const n = document.getElementById(id); if (n) { n.focus(); try { if (s != null) n.setSelectionRange(s, e); } catch (x) { /* number inputs */ } } }
}
function readVal(el) { if (el.type === 'checkbox') return el.checked; if (el.dataset.num) return el.value === '' ? '' : Number(el.value); return el.value; }
function onInput(ev) {
  const el = ev.target;
  if (el.dataset.bind && T.edit) {
    setPath(T.edit, el.dataset.bind, readVal(el)); T.dirty = true;
    if (el.dataset.bind === 'segment') T.edit.reachAt = Date.now();
    if (el.dataset.bind === 'startMode' || el.dataset.bind === 'start') { const s = startMs(T.edit, Date.now()); if (!isNaN(s) && !T.endTouched) T.edit.end = toLocal(defaultEnd(s)); }
    if (el.dataset.bind === 'end') T.endTouched = true;
    if (ev.type === 'input' && el.tagName === 'INPUT' && el.type !== 'radio' && el.type !== 'checkbox') return keepFocus(render);
    return keepFocus(render);
  }
  if (el.dataset.cbind && T.content) {
    setPath(T.content, el.dataset.cbind, readVal(el)); T.contentDirty = true; T.testSent = ''; if (el.dataset.cbind === 'html') T.htmlNotice = '';
    return keepFocus(render);
  }
  const a = el.dataset.act; if (!a) return;
  if (a === 'ov-name') { T.modal.name = el.value; return; }
  if (a === 'ov-format') { T.modal.format = el.value; return; }
  if (a === 'ov-kind') { T.modal.kind = el.value; return; }
  if (a === 'bigtext') { T.bigText = el.checked; return render(); }
  if (a === 'html-file') return loadHtml(el.files[0]);
  if (a === 'toggle-archived') { S.showArchived = el.checked; save(); return render(); }
  if (a === 'token' && el.value) { const k = el.value, tgt = el.dataset.target; T.content[tgt] = (T.content[tgt] ? T.content[tgt].replace(/\s*$/, ' ') : '') + `{{${k} | "${TOKENS[k]}"}}`; T.contentDirty = true; return render(); }
  if (a === 'media-mode') { T.content.media = { ...T.content.media, mode: el.value, src: '', error: '' }; return render(); }
  if (a === 'media-url' && ev.type === 'change') return loadUrl(el.value.trim());
  if (a === 'media-file') return loadFile(el.files[0]);
  if (a === 'test-dev') { const d = T.content.test.devices; el.checked ? d.push(el.value) : d.splice(d.indexOf(el.value), 1); T.testErr = ''; return render(); }
  if (a === 'test-mode') { T.content.test.mode = el.value; T.testErr = ''; return render(); }
  if (a === 'test-lead') { T.content.test.lead = el.value; T.testErr = ''; return render(); }
  if (a === 'version') { S.version = el.value; save(); return render(); }
  if (a === 'sdk') { S.settings.sdk = el.checked; save(); return render(); }
  if (a === 'fatigue' && ev.type === 'change') { const v = Number(el.value); if (!inRange(v, RANGES.fatigue)) { T.fatErr = 'Fatigue limit must be between 1 and 5.'; } else { T.fatErr = ''; S.settings.fatigue = v; save(); toast('Fatigue limit saved.'); } return render(); }
}
function loadUrl(url) {
  const m = T.content.media; m.src = url; m.error = '';
  if (!url) return render();
  const img = new Image();
  img.onload = () => { if (T.content && T.content.media.src === url) { m.error = ''; render(); } };
  img.onerror = () => { if (T.content && T.content.media.src === url) { m.error = "This link doesn't open an image."; render(); } };
  img.src = url; render();
}
function loadFile(file) {
  const m = T.content.media; if (!file) return;
  if (!/^image\//.test(file.type)) { m.src = ''; m.error = "This file isn't an image."; return render(); }
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => { const max = 800, k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); m.src = cv.toDataURL('image/jpeg', 0.82); m.error = ''; render(); }; img.onerror = () => { m.error = "This file isn't an image."; render(); }; img.src = r.result; };
  r.readAsDataURL(file);
}
function loadHtml(file) { // IA02-11 upload: keep the body fragment, lift <style> into CSS, drop title/meta with a notice
  if (!file) return;
  if (!/\.html?$/i.test(file.name)) { T.htmlNotice = ''; return toast("This file isn't an HTML file or valid zip bundle."); }
  const r = new FileReader();
  r.onload = () => {
    let h = String(r.result); const had = /<(title|meta)\b/i.test(h);
    h = h.replace(/<title[\s\S]*?<\/title>/gi, '').replace(/<meta\b[^>]*>/gi, '');
    const sm = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(h); if (sm) T.content.css = sm[1].trim();
    const bm = /<body[^>]*>([\s\S]*)<\/body>/i.exec(h); if (bm) h = bm[1];
    T.content.html = h.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<\/?(html|head|body)[^>]*>/gi, '').trim();
    T.contentDirty = true; T.htmlNotice = had ? "Removed the page title and meta tags. They don't apply inside an overlay." : ''; render();
  };
  r.readAsText(file);
}
function persistJourney(publish) { // SCR-IA-08 journey campaigns: saved and published from SCR-IA-02
  const e = clone(T.edit), now = Date.now(); let orig = camp(e.id);
  if (!orig) { orig = { ...e, id: 'IA-' + (++S.seq), status: 'Draft', version: 1, createdOn: toLocal(now), stats: {} }; S.campaigns.unshift(orig); T.edit.id = orig.id; }
  if (publish) {
    const issues = validate(e, ctx()); if (issues.length) return toast(issues[0].msg);
    const live = ['Published', 'Paused'].includes(orig.status);
    Object.assign(orig, e, { id: orig.id, status: live ? orig.status : 'Published', version: live ? orig.version + 1 : 1, stats: orig.stats || {}, pending: null, start: live ? orig.start : toLocal(now) });
    save(); T.edit = null; T.content = null; toast(live ? `Published v${orig.version}.` : 'Published. Add it to an In-App node on the journey canvas.'); return go('list');
  }
  if (['Published', 'Paused'].includes(orig.status)) orig.pending = e; else Object.assign(orig, e, { id: orig.id, status: 'Draft' });
  save();
}
function confirmDlg(title, body, ok, fn, danger) { T.modal = { type: 'confirm', title, body, ok, fn, danger }; render(); }
function applyTx(c, ev, role) {
  const r = transition(c, ev, role, Date.now()); if (!r.ok) { toast(r.error); return false; }
  c.status = r.to;
  if (ev === 'end' && c.stats.all) c.stats.all = closeOut(c.stats.all);
  if (ev === 'start' && !c.stats.all) c.stats.all = zeroStats(c);
  save(); return true;
}
function zeroStats(c) { const sg = seg(c.segment); const e = sg ? sg.reach : 0; return { eligible: e, shownU: 0, shownT: 0, clickedU: 0, clickedT: 0, dismissedU: 0, dismissedT: 0, still: e, reasons: {}, buttons: {}, kpm: { engaged: 0 } }; }
function persistEdit(publish) {
  const e = clone(T.edit), now = Date.now(), orig = camp(e.id);
  if (publish) {
    const issues = validate(e, ctx()); if (issues.length) return toast(issues[0].msg);
    if (orig && ['Published', 'Paused'].includes(orig.status)) {
      const r = transition(orig, 'republish', S.role, now); if (!r.ok) return toast(r.error);
      Object.assign(orig, e, { status: orig.status, version: r.version, stats: orig.stats, pending: null, createdOn: orig.createdOn, createdBy: orig.createdBy, start: orig.start, startMode: orig.startMode });
      orig.stats[r.version] = null; save(); T.edit = null; toast(`Published v${r.version}. Buyers see it on their next manifest refresh.`); return go('list');
    }
    const target = orig || { ...e, id: 'IA-' + (++S.seq), createdOn: toLocal(now) };
    const r = transition(target.status ? target : { ...e, status: 'Draft' }, 'publish', S.role, now); if (!r.ok) return toast(r.error);
    Object.assign(target, e, { id: target.id, createdOn: target.createdOn, status: r.to, version: 1 });
    if (e.startMode === 'now') target.start = toLocal(now);
    if (r.to === 'Published') target.stats = { all: zeroStats(target) };
    if (!orig) S.campaigns.unshift(target);
    save(); T.edit = null; toast(r.to === 'Scheduled' ? 'Scheduled. It goes live at Start.' : 'Published. It shows on each buyer\'s next trigger.'); return go('list');
  }
  if (orig && ['Published', 'Paused', 'Scheduled'].includes(orig.status)) {
    if (orig.status === 'Scheduled') { Object.assign(orig, e, { status: 'Scheduled' }); }
    else orig.pending = e;
  } else if (orig) Object.assign(orig, e);
  else S.campaigns.unshift({ ...e, id: 'IA-' + (++S.seq), createdOn: toLocal(now) });
  save(); T.edit = null; T.dirty = false; toast('Saved as draft.'); go('list');
}
function onClick(ev) {
  const el = ev.target.closest('[data-act],[data-nav]'); if (!el) return;
  if (el.dataset.nav) { if (el.dataset.nav === 'legacy') return; const v = el.dataset.nav === 'settings' ? 'settings' : 'list'; T.edit = null; T.content = null; return go(v); }
  const a = el.dataset.act, id = el.dataset.id, c = id && camp(id);
  switch (a) {
    case 'new-overlay': T.modal = { type: 'overlay', name: '', format: 'modal', kind: 'template', err: false }; render(); { const n = $('#ov-name'); if (n) n.focus(); } return;
    case 'ov-create': { const m = T.modal; if (!m.name.trim()) { m.err = true; return render(); } T.modal = null; T.edit = Object.assign(newCampaign(), { name: m.name.trim(), journey: true }); T.content = Object.assign(newContent(), { format: m.format, kind: m.kind }); T.edit.content = clone(T.content); T.contentDirty = false; T.testSent = ''; T.testErr = ''; T.htmlNotice = ''; persistJourney(false); return go('content', T.edit.id); }
    case 'journey-publish': T.edit.content = clone(T.content); return persistJourney(true);
    case 'zip-sample': T.content.html = SAMPLE_HTML; T.content.css = SAMPLE_CSS; T.content.files = ['hero.webp']; T.contentDirty = true; T.htmlNotice = 'Loaded centralis-due.zip: index.html, style.css, hero.webp.'; return render();
    case 'new': T.edit = newCampaign(); T.dirty = false; T.endTouched = false; return go('setup');
    case 'edit': { if (!can('create')) return go('analytics', id); if (c.journey) { T.edit = clone(c.pending || c); T.content = clone(T.edit.content || newContent()); T.contentDirty = false; T.htmlNotice = ''; return go('content', id); } T.edit = clone(c.pending || c); T.dirty = false; T.endTouched = true; if (c.pending) toast(`Resuming your unpublished v${c.version + 1} draft.`); return go('setup', id); }
    case 'open-analytics': S.tab = 'analytics'; S.version = 'all'; T.refreshAt = Date.now(); return go('analytics', id);
    case 'tx': { const run = () => { if (applyTx(c, el.dataset.ev, S.role)) toast(`${c.name}: ${c.status}.`); render(); }; if (el.dataset.ev === 'archive') { const r = transition(c, 'archive', S.role, Date.now()); if (!r.ok) return toast(r.error); } if (el.dataset.ev === 'archive') return confirmDlg('Archive this campaign?', 'It leaves the list and its results stay read-only.', 'Archive', run, true); return run(); }
    case 'sys': if (applyTx(c, el.dataset.ev, 'system')) toast(`${c.name}: ${c.status}.`); return render();
    case 'clone': { if (!transition(c, 'clone', S.role, Date.now()).ok) return; const now = Date.now(); const n = { ...clone(c), id: 'IA-' + (++S.seq), name: ('Copy of ' + c.name).slice(0, 50), status: 'Draft', version: 0, stats: {}, pending: null, startMode: 'now', start: toLocal(now + H), end: toLocal(defaultEnd(now)), createdOn: toLocal(now), createdBy: 'Pratik Wankhede' }; S.campaigns.unshift(n); save(); toast('Cloned as a new draft.'); return render(); }
    case 'tile': if (el.dataset.tile !== 'In-App') toast(`${el.dataset.tile} setup is outside this In-App prototype.`); else if (!S.settings.sdk) toast('Connect your app to Sirrus to use In-App.'); return;
    case 'refresh-count': T.edit.reachAt = Date.now(); return render();
    case 'choose-content': T.content = clone(T.edit.content || newContent()); if (!T.content.test) T.content.test = { devices: [], mode: 'default', lead: '' }; T.contentDirty = false; T.testSent = ''; T.testErr = ''; return go('content');
    case 'nav-settings': return confirmDlg('Leave setup?', 'Unsaved changes on this campaign will be lost.', 'Go to settings', () => { T.edit = null; go('settings'); });
    case 'end-default': T.endTouched = false; T.edit.end = toLocal(defaultEnd(startMs(T.edit, Date.now()))); return render();
    case 'setup-cancel': if (!T.dirty) { T.edit = null; return go('list'); } return confirmDlg('Discard changes?', 'Your edits to this campaign will be lost.', 'Discard', () => { T.edit = null; go('list'); }, true);
    case 'save-draft': return persistEdit(false);
    case 'publish': return persistEdit(true);
    case 'format': T.content.format = el.dataset.f; T.contentDirty = true; return render();
    case 'add-b2': T.content.b2 = { label: '', action: 'dismiss', screen: '' }; return render();
    case 'remove-b2': T.content.b2 = null; return render();
    case 'platform': S.platform = el.dataset.p; save(); return render();
    case 'send-test': { const t = T.content.test; if (!t.devices.length) { T.testErr = 'dev'; return render(); } if (t.mode === 'lead' && !t.lead) { T.testErr = 'lead'; return render(); } T.testErr = ''; T.testSent = resolveTokens(T.content.headline, t.mode === 'lead' ? LEADS.find(l => l.id === t.lead) : null) || '(no headline)'; return render(); }
    case 'content-cancel': { const back = T.edit && T.edit.journey ? () => { T.content = null; T.edit = null; go('list'); } : () => { T.content = null; go('setup'); }; if (!T.contentDirty) return back(); return confirmDlg('Discard content changes?', 'The overlay goes back to how it was.', 'Discard', back, true); }
    case 'content-save': { const ct = clone(T.content); T.edit.content = ct; T.dirty = true; if (T.edit.journey) { T.contentDirty = false; persistJourney(false); toast('Saved.'); return render(); } T.content = null; toast('Content saved.'); return go('setup'); }
    case 'add-device': T.modal = { type: 'device', code: String(Date.now()), expired: false }; return render();
    case 'sim-scan': { if (S.devices.length >= DEVICE_LIMIT) return render(); const [model, platform] = DEVICE_MODELS[S.modelIdx++ % DEVICE_MODELS.length]; S.devices.push({ id: 'd' + Date.now(), name: model, model, platform }); T.modal.added = model; T.modal.code = String(Date.now()); save(); return render(); }
    case 'sim-expire': T.modal.expired = true; return render();
    case 'rename': T.renaming = id; render(); const n = document.getElementById('ren-' + id); if (n) n.focus(); return;
    case 'rename-save': { const d = S.devices.find(x => x.id === id), v = document.getElementById('ren-' + id).value.trim(); if (v) d.name = v; T.renaming = null; save(); return render(); }
    case 'remove-dev': { const d = S.devices.find(x => x.id === id); const keep = T.modal; return confirmDlg(`Remove ${d.name}?`, 'It stops receiving test messages.', 'Remove', () => { S.devices = S.devices.filter(x => x.id !== id); if (T.content) T.content.test.devices = T.content.test.devices.filter(x => x !== id); save(); if (keep && keep.type === 'device') T.modal = keep; render(); }, true); }
    case 'modal-close': T.modal = null; return render();
    case 'modal-ok': { const f = T.modal.fn; T.modal = null; f(); return render(); }
    case 'tab': S.tab = el.dataset.t; save(); return render();
    case 'mode': S.mode = el.dataset.m; save(); return render();
    case 'refresh': if (!S.demo.resultsDown) T.refreshAt = Date.now(); else toast("Couldn't load results. Refresh to try again."); return render();
    case 'quiet-rm': S.settings.quiet = S.settings.quiet.filter(s => s !== el.dataset.s); save(); return render();
    case 'quiet-add': S.settings.quiet.push($('#quiet-add').value); save(); return render();
    case 'reset': try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } S = seed(); T = { edit: null, content: null, modal: null, refreshAt: Date.now() }; toast('Demo reset.'); return render();
  }
}
document.addEventListener('click', onClick);
document.addEventListener('input', ev => { const el = ev.target; if (el.type === 'number' || el.type === 'datetime-local' || el.type === 'file' || el.dataset.act === 'media-url' || el.dataset.act === 'fatigue' || el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') return; onInput(ev); });
document.addEventListener('change', onInput);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && T.modal) { T.modal = null; render(); } });
$('#role').addEventListener('change', ev => { S.role = ev.target.value; save(); if (S.role === 'viewer' && ['setup', 'content'].includes(S.view)) { T.edit = null; T.content = null; S.view = 'list'; } render(); });
document.querySelectorAll('[data-demo]').forEach(cb => { cb.checked = !!S.demo[cb.dataset.demo]; cb.addEventListener('change', () => { S.demo[cb.dataset.demo] = cb.checked; save(); render(); }); });
render();
})();
