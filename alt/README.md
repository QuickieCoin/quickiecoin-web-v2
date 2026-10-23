# QuickieCoin alternative site (design preview)

A standalone, static redesign of quickiecoin.com built with the Hallmark design skill
(github.com/nutlope/hallmark, Grid theme, re-coloured in QuickieCoin's own palette).
Nothing here is wired into the live site: it publishes from this `alt/` folder only, to its
own Netlify project, with `noindex` and a canonical pointing at quickiecoin.com.

- `index.html`, `site.css`: the page. `tokens.css`, `base.css`: Hallmark scaffold (tokens are brand-locked).
- `assets/`: copies of the live site's logo and machine photos.
- `.hallmark/`: the skill's brand spec, build log and lint screenshots.

No analytics, no forms: contact is phone and email, the wire desk links to quickiecoin.com/#wires.
