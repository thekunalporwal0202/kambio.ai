/**
 * Builds demo.html — a single self-contained file of the site, for publishing
 * somewhere Gazal can open it without anything being deployed.
 *
 * Generated from index.html and styles.css rather than maintained by hand, so
 * the demo can never drift from the site that actually ships. Re-run it after
 * any edit:
 *
 *     node gazalfoods/build-demo.mjs
 *
 * Three differences from the real site, all deliberate:
 *   1. The CSS is inlined — the demo has to be one file.
 *   2. It is marked as a proposal, so nobody can mistake it for gazalfoods.net.
 *   3. The enquiry form is inert. A demo form with a real Send button would
 *      swallow whatever someone typed into it; this one says so instead.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(here, 'index.html'), 'utf8');
const css = await readFile(join(here, 'styles.css'), 'utf8');

const title = html.match(/<title>([\s\S]*?)<\/title>/)[1].trim();
let body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));

// ---------------------------------------------------------------- 1. proposal
// A strip at the very top, and a pill in the sticky header that stays put once
// the strip has scrolled away.
const strip = `
    <div class="proposal-strip">
      <div class="container">
        <strong>Design proposal</strong> for Gazal Al Khadara Trading &mdash; this is not the live
        site. <a href="https://www.gazalfoods.net" rel="noopener noreferrer" target="_blank">gazalfoods.net</a>
        is unchanged.
      </div>
    </div>
`;
body = body.replace('    <header class="site-header"', strip + '    <header class="site-header"');
body = body.replace('        </a>\n\n        <nav class="nav"', '        </a>\n\n        <span class="proposal-pill">Proposal</span>\n\n        <nav class="nav"');

// ------------------------------------------------------------------- 2. form
// Keep every field visible so the layout can be judged, but intercept the
// submit: nothing is collected and nobody is left thinking it was.
body = body.replace(
  '<form class="form" method="post" action="contact.php" novalidate>',
  '<form class="form" id="demoForm" novalidate>'
);
body = body.replace(
  '              <button class="btn btn--primary btn--block" type="submit">Send enquiry</button>',
  `              <button class="btn btn--primary btn--block" type="submit">Send enquiry</button>

              <p class="form__demo" id="demoNotice" role="status">
                This is a preview, so the form is switched off. On the live site it emails each
                enquiry to the office and keeps a copy on the server.
              </p>`
);

// ----------------------------------------------------------------- 3. footer
body = body.replace(
  '        <p>Sultanate of Oman</p>',
  '        <p>Design proposal &mdash; not the published site</p>'
);

// The favicon is set when the page is published; the data-URI link is dropped.
body = body.replace(/\n\s*<script>/, '\n    <script>');

const demoCss = `
/* --------------------------------------------------- proposal-only styling */

.proposal-strip {
  background: var(--brand-deep);
  color: rgba(250, 246, 238, 0.82);
  font-size: 0.8125rem;
  padding-block: 0.625rem;
}

.proposal-strip strong {
  color: var(--gold);
  font-weight: 700;
}

.proposal-strip a {
  color: var(--cream);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.proposal-pill {
  flex: none;
  margin-right: auto;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--brand);
  background: var(--gold-tint);
  border: 1px solid var(--gold);
  border-radius: 999px;
  padding: 0.1875rem 0.5rem;
}

@media (max-width: 560px) {
  .proposal-pill {
    display: none;
  }
}

.form__demo {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--muted);
  text-align: center;
  background: var(--cream-2);
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  padding: 0.75rem 0.875rem;
}

.form__demo--sent {
  color: var(--brand);
  border-style: solid;
  border-color: var(--brand);
  background: var(--brand-tint);
}
`;

const demoScript = `
      // Demo only: the live site posts this form to contact.php.
      var demoForm = document.getElementById('demoForm');
      var demoNotice = document.getElementById('demoNotice');
      demoForm.addEventListener('submit', function (e) {
        e.preventDefault();
        demoNotice.classList.add('form__demo--sent');
        demoNotice.textContent =
          'Nothing was sent — this is a preview. On the live site this enquiry would reach the ' +
          'office by email, with a copy kept on the server in case the mail is lost.';
        demoNotice.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
`;
body = body.replace('    </script>', demoScript + '    </script>');

const out = `<title>${title.replace(/^Noor Gazal — .*/, 'Noor Gazal Site Proposal')}</title>
<style>
${css}${demoCss}</style>
${body.trim()}
`;

await writeFile(join(here, 'demo.html'), out);
console.log(`demo.html written — ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
