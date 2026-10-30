#!/usr/bin/env node
/* Builds the static location pages and the sitemap from the machine directory
   in index.html (Component.MACHINES), so the directory stays the one source of
   truth. Run it after editing a machine, then commit what it writes:

     node tools/build-locations.js

   Writes /locations/index.html, /locations/<slug>/index.html for every machine,
   and /sitemap.xml. A machine's page is plain HTML like /hosting/: no React, no
   support.js, nothing to hydrate, so Google reads the whole page from the first
   response. A machine with open: false still gets a page (it says so) rather
   than turning a link that Google has into a 404.

   No fee or percentage goes on these pages (Sam, 2026-09-04 and 2026-10-28). The
   live rate is linked on Coin ATM Radar, as the homepage cards do. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://quickiecoin.com';
const LASTMOD = process.env.LASTMOD || new Date().toISOString().slice(0, 10);

// ---- read the directory out of index.html ----------------------------------

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function staticArray(name) {
  const start = indexHtml.indexOf('static ' + name + ' = [');
  if (start < 0) throw new Error('index.html: no static ' + name);
  const open = indexHtml.indexOf('[', start);
  let depth = 0, i = open, quote = null;
  for (; i < indexHtml.length; i++) {
    const c = indexHtml[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) break;
  }
  return new Function('return ' + indexHtml.slice(open, i + 1))();
}
const MACHINES = staticArray('MACHINES');

for (const m of MACHINES) {
  if (!/^[a-z0-9-]+$/.test(m.slug || '')) throw new Error('machine without a valid slug: ' + m.location);
}

// ---- helpers ---------------------------------------------------------------

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ldJson = o => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

function parts(m) {
  // "462 West Side Ave, Jersey City, NJ 07304[, United States]"
  const p = m.address.split(',').map(s => s.trim()).filter(s => s && !/^united states$/i.test(s));
  const sz = (p[2] || '').match(/^([A-Z]{2})\s+(\d{5})$/);
  if (p.length < 3 || !sz) throw new Error('unparseable address: ' + m.address);
  return { street: p[0], city: p[1], state: sz[1], zip: sz[2] };
}
// Width and height of a .webp, so the photo's box is reserved before it loads.
function webpSize(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  throw new Error('not a webp: ' + rel);
}
// "Wine Spot - North Bergen" reads twice next to the town; drop the suffix.
const label = m => m.location.replace(/\s+-\s+.*$/, '');
const pageUrl = m => '/locations/' + m.slug + '/';
const dirUrl = m => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.location + ' ' + m.address);
const sells = m => /teamwork/i.test(m.location + ' ' + m.name); // the only two-way unit, as in index.html

function miles(a, b) {
  const r = x => x * Math.PI / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLon = r(b.long - a.long);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// "Monday - Saturday: 10AM–6:00PM" -> schema.org openingHours "Mo-Sa 10:00-18:00"
const DAYS = { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' };
function day(s) { const k = s.trim().slice(0, 3).toLowerCase(); return DAYS[k]; }
function time(s) {
  const t = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!t) return null;
  let h = +t[1] % 12; if (t[3] === 'pm') h += 12;
  return String(h).padStart(2, '0') + ':' + (t[2] || '00');
}
function openingHours(lines) {
  const out = [];
  for (const line of lines) {
    const [d, hrs] = line.split(/:\s(.+)/);
    if (!hrs || /closed/i.test(hrs)) continue;
    let days;
    if (/every day/i.test(d)) days = 'Mo-Su';
    else {
      const ds = d.split(/\s*-\s*/).map(day);
      if (ds.some(x => !x)) continue;
      days = ds.join('-');
      if (days === 'Su-Sa') days = 'Mo-Su';
    }
    const ts = hrs.split(/\s*[-–]\s*/).map(time);
    if (ts.length !== 2 || ts.some(x => !x)) continue;
    out.push(days + ' ' + ts[0] + '-' + (ts[1] === '00:00' ? '24:00' : ts[1]));
  }
  return out;
}

// ---- shared chrome ---------------------------------------------------------

const FONTS = fs.readFileSync(path.join(__dirname, 'fonts-head.html'), 'utf8').trim();
const GTAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HLE7B2H2NW"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-HLE7B2H2NW');
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href^="tel:"]') : null;
    if (a) { gtag('event', 'phone_click', { link_url: a.getAttribute('href') }); }
  });
</script>`;

const PAGE_CSS = `<style>
.crumbs{font-size:14px;color:var(--soft);margin:0 0 18px}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.crumbs li+li::before{content:"\\203A";margin-right:6px;color:var(--soft)}
.crumbs [aria-current]{color:var(--ink)}
.loc-photo{display:block;width:100%;max-width:360px;height:auto;border-radius:18px;border:1px solid var(--line);background:#E9F1F8;margin:6px 0 22px}
.loc-facts{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.loc-facts h2{font-size:20px;margin:0 0 8px}
.loc-facts p,.loc-facts ul{margin:0}
.loc-facts ul{padding-left:0;list-style:none;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:14px}
.loc-actions{display:flex;flex-wrap:wrap;gap:12px;margin:22px 0 8px}
.loc-actions .btn{flex:1 1 180px;text-align:center}
.loc-list{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.loc-list a{font-weight:600}
.loc-list span{display:block;color:var(--soft);font-size:14px}
@media (max-width:560px){.loc-facts{grid-template-columns:1fr}}
</style>`;

function head({ title, description, canonical, ld }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${FONTS}
${GTAG}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${canonical}">
<link rel="icon" type="image/x-icon" href="/static/favicon.ico">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<meta name="theme-color" content="#F4F8FB">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:site_name" content="QuickieCoin">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/assets/images/og-image.jpg">
<link rel="stylesheet" href="/assets/css/pages.7d7e9032.css">
${PAGE_CSS}
<script type="application/ld+json">
${ldJson(ld)}
</script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>

<header class="hdr">
  <div class="hdr-in">
    <a class="hdr-logo" href="/" aria-label="QuickieCoin home"><img src="/assets/images/logo.webp" alt="QuickieCoin" width="268" height="30"></a>
    <nav class="hdr-nav" aria-label="Main">
      <a href="/#how">How it works</a>
      <a href="/locations/">Locations</a>
      <a href="/#faqs">FAQs</a>
      <a href="/#wires">Wires</a>
    </nav>
    <a class="hdr-tel" href="tel:+12014195933">201&#8209;419&#8209;5933</a>
  </div>
</header>
`;
}

function crumbs(trail) {
  const items = trail.map((c, i) => i === trail.length - 1
    ? `<li><span aria-current="page">${esc(c.name)}</span></li>`
    : `<li><a href="${c.url}">${esc(c.name)}</a></li>`).join('');
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}
function crumbsLd(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + c.url }))
  };
}

const FOOT = `
<footer class="ftr">
  <div class="ftr-in">
    <div>
      <img src="/assets/images/logo.webp" alt="QuickieCoin" width="214" height="24">
      <p class="ftr-blurb">&#169; 2026 QuickieCoin NJ LLC &#183; A FinCEN&#8209;registered money services business. Buy bitcoin for cash at our machines across Hudson County, New Jersey.</p>
    </div>
    <nav class="ftr-links" aria-label="Footer">
      <a href="/locations/">Locations</a>
      <a href="/wallets/">Get a wallet</a>
      <a href="/hosting/">Hosting</a>
      <a href="/privacy/">Privacy</a>
      <a href="/terms/">Terms</a>
      <a href="https://instagram.com/quickiecoin" target="_blank" rel="noreferrer">Instagram</a>
      <a href="https://twitter.com/quickiecoin" target="_blank" rel="noreferrer">Twitter</a>
      <a href="mailto:team@quickiecoin.com">team@quickiecoin.com</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;

// ---- one page per machine --------------------------------------------------

function machineLd(m) {
  const a = parts(m);
  const node = {
    '@type': 'LocalBusiness',
    // Same @id as the homepage's injected node, so Google merges the two.
    '@id': SITE + '/#machine-' + String(m._id).replace(/[^A-Za-z0-9_-]/g, ''),
    name: 'QuickieCoin Bitcoin ATM - ' + m.location,
    description: 'Buy bitcoin for cash at a QuickieCoin machine inside ' + m.location + ', ' + a.city + ', NJ.',
    url: SITE + pageUrl(m),
    telephone: '+1-201-419-5933',
    parentOrganization: { '@id': SITE + '/#organization' },
    currenciesAccepted: 'USD',
    paymentAccepted: 'Cash',
    address: { '@type': 'PostalAddress', streetAddress: a.street, addressLocality: a.city, addressRegion: a.state, postalCode: a.zip, addressCountry: 'US' },
    geo: { '@type': 'GeoCoordinates', latitude: m.lat, longitude: m.long },
    hasMap: dirUrl(m)
  };
  if (m.thumbUrl) node.image = SITE + m.thumbUrl;
  const oh = openingHours(m.hours || []);
  if (oh.length) node.openingHours = oh;
  return node;
}

function machinePage(m) {
  const a = parts(m);
  const two = sells(m);
  const trail = [{ name: 'Home', url: '/' }, { name: 'Locations', url: '/locations/' }, { name: m.location, url: pageUrl(m) }];
  const title = `Bitcoin ATM at ${label(m)}, ${a.city} NJ | QuickieCoin`;
  const description = `Buy bitcoin with cash at the QuickieCoin ${two ? 'machine' : 'bitcoin ATM'} inside ${label(m)}, ${a.street}, ${a.city}, NJ.${two ? ' This machine also sells bitcoin for cash.' : ''} Hours, directions and what to bring.`;
  const others = MACHINES.filter(o => o !== m)
    .map(o => ({ o, d: miles(m, o) }))
    .sort((x, y) => x.d - y.d);

  const hours = (m.hours || []).map(h => `<li>${esc(h)}</li>`).join('');
  const [pw, ph] = m.thumbUrl ? webpSize(m.thumbUrl) : [0, 0];
  const photo = m.thumbUrl
    ? `<img class="loc-photo" src="${m.thumbUrl}" alt="Storefront of ${esc(m.location)}, ${esc(a.street)}, ${esc(a.city)}" width="${pw}" height="${ph}" fetchpriority="high">`
    : '';
  const status = m.open
    ? ''
    : `<div class="callout"><p><strong>This machine is temporarily out of service.</strong> Call <a href="tel:+12014195933">201&#8209;419&#8209;5933</a> and we&#8217;ll point you to the nearest working one.</p></div>`;

  return head({
    title, description, canonical: pageUrl(m),
    ld: { '@context': 'https://schema.org', '@graph': [machineLd(m), crumbsLd(trail)] }
  }) + `
<main id="content">
  ${crumbs(trail)}
  <p class="eyebrow">${esc(a.city)}, NJ</p>
  <h1>Bitcoin ATM at ${esc(label(m))}, ${esc(a.city)}</h1>
  <p class="lede">${two
    ? `Buy bitcoin with cash, or sell bitcoin for cash, at the QuickieCoin machine inside ${esc(m.location)} on ${esc(a.street.replace(/^\d+\s+/, ''))} in ${esc(a.city)}. It is the only machine in our fleet that pays out cash.`
    : `Buy bitcoin with cash at the QuickieCoin machine inside ${esc(m.location)} on ${esc(a.street.replace(/^\d+\s+/, ''))} in ${esc(a.city)}. No account and no bank needed.`}</p>
  ${status}
  ${photo}

  <div class="loc-facts">
    <div class="card">
      <h2>Address</h2>
      <p>${esc(m.location)}<br>${esc(a.street)}<br>${esc(a.city)}, ${a.state} ${a.zip}</p>
    </div>
    <div class="card">
      <h2>Hours</h2>
      <ul>${hours}</ul>
    </div>
  </div>

  <p class="loc-actions">
    <a class="btn" href="${esc(dirUrl(m))}" target="_blank" rel="noreferrer">Get directions</a>
    <a class="btn" href="tel:+12014195933">Call 201&#8209;419&#8209;5933</a>
  </p>
  ${m.radarUrl ? `<p>The live buy rate for this machine is posted on <a href="${esc(m.radarUrl)}" target="_blank" rel="noopener noreferrer">Coin ATM Radar</a>.</p>` : ''}

  <h2>How to buy bitcoin here</h2>
  <ol>
    <li>Open a bitcoin wallet on your phone and tap <strong>Receive</strong>. No wallet yet? <a href="/wallets/">Get one here</a> before you go.</li>
    <li>At the machine, tap <strong>Buy Bitcoin</strong> and hold your wallet&#8217;s QR code up to the scanner.</li>
    <li>Verify with your phone number, feed in your cash, and confirm. The bitcoin goes straight to your wallet.</li>
  </ol>
  ${two ? `<h2>Selling bitcoin for cash</h2>
  <p>Choose to sell on the machine&#8217;s screen, pick an amount, and send bitcoin from your wallet to the QR code it shows. The machine pays out cash once your payment is accepted.</p>` : ''}
  <p>Bigger purchases need more verification, and the machine tells you on screen what it needs before you put any cash in. Bring a government&#8209;issued photo ID if you plan to buy a lot. The limit is $25,000 per day, per customer. Buying more than that? Ask about <a href="/#wires">buying by bank wire</a>.</p>

  <h2>Other QuickieCoin machines nearby</h2>
  <ul class="loc-list">
${others.map(({ o, d }) => `    <li><a href="${pageUrl(o)}">${esc(o.location)}</a><span>${esc(parts(o).street)}, ${esc(parts(o).city)} &#183; ${d.toFixed(1)} mi away</span></li>`).join('\n')}
  </ul>

  <p class="meta">Questions about a transaction? Call <a href="tel:+12014195933">201&#8209;419&#8209;5933</a> or email <a href="mailto:team@quickiecoin.com">team@quickiecoin.com</a>, and tell us which machine.</p>
</main>
` + FOOT;
}

// ---- the directory page ----------------------------------------------------

function indexPage() {
  const trail = [{ name: 'Home', url: '/' }, { name: 'Locations', url: '/locations/' }];
  const byCity = {};
  for (const m of MACHINES) (byCity[parts(m).city] = byCity[parts(m).city] || []).push(m);
  const cities = Object.keys(byCity).sort((x, y) => byCity[y].length - byCity[x].length || x.localeCompare(y));
  const list = {
    '@type': 'ItemList',
    itemListElement: MACHINES.map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + pageUrl(m), name: m.location }))
  };
  return head({
    title: 'Bitcoin ATM Locations in Jersey City, Bayonne, Harrison & North Bergen | QuickieCoin',
    description: `All ${MACHINES.length} QuickieCoin bitcoin ATMs in Hudson County, NJ: Jersey City, Bayonne, Harrison and North Bergen. Addresses, hours and directions.`,
    canonical: '/locations/',
    ld: { '@context': 'https://schema.org', '@graph': [list, crumbsLd(trail)] }
  }) + `
<main id="content">
  ${crumbs(trail)}
  <p class="eyebrow">Locations</p>
  <h1>QuickieCoin bitcoin ATM locations</h1>
  <p class="lede">${MACHINES.length} machines in stores across Hudson County. Walk in with cash and a wallet app on your phone. Every machine sells bitcoin, and the one at Teamwork Wireless in Bayonne buys it back for cash too.</p>
  <p>Want them on a map? <a href="/#locations">See the map on our homepage</a>.</p>
${cities.map(c => `
  <h2>Bitcoin ATMs in ${esc(c)}</h2>
  <ul class="loc-list">
${byCity[c].sort((x, y) => x.location.localeCompare(y.location)).map(m => `    <li><a href="${pageUrl(m)}">${esc(m.location)}</a><span>${esc(parts(m).street)} &#183; ${esc((m.hours || []).join(', '))}${sells(m) ? ' &#183; buy and sell' : ''}</span></li>`).join('\n')}
  </ul>`).join('\n')}
</main>
` + FOOT;
}

// ---- sitemap ---------------------------------------------------------------

function sitemap() {
  const urls = [
    ['/', 'weekly', '1.0'],
    ['/locations/', 'weekly', '0.9'],
    ...MACHINES.map(m => [pageUrl(m), 'monthly', '0.8']),
    ['/hosting/', 'monthly', '0.7'],
    ['/wallets/', 'monthly', '0.6'],
    ['/privacy/', 'yearly', '0.3'],
    ['/terms/', 'yearly', '0.3']
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, f, p]) => `  <url>
    <loc>${SITE}${u}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${f}</changefreq>
    <priority>${p}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

// ---- write -----------------------------------------------------------------

function write(rel, s) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
  console.log('wrote', rel);
}
write('locations/index.html', indexPage());
for (const m of MACHINES) write('locations/' + m.slug + '/index.html', machinePage(m));
write('sitemap.xml', sitemap());
