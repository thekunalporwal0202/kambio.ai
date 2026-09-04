# Noor Gazal — gazalfoods.net

A redesign of the Noor Gazal site, built the same way as `landing/`: four files
that drop straight onto plain shared hosting. No Node, no build step, no
database, no external fonts, scripts or images. The whole page is one HTML file,
one stylesheet, and one PHP handler for the enquiry form.

```
index.html        the whole page
styles.css        all styling — brand colours live in one block at the top
contact.php       enquiry handler — saves to disk, then emails
.htaccess         HTTPS + www redirect, security headers, blocks the store
_leads/           where enquiries are written (never web-readable)
```

The existing site is static HTML on the same kind of host, so this replaces it
file-for-file rather than asking anyone to migrate.

---

## Read this first — the brand colours

**The colours in `styles.css` are a reconstruction, not the real values.** They
were matched to the Noor Gazal retail packaging (deep green, gold, red on a warm
cream ground) because the live site could not be reached from the environment
this was built in.

Fixing that is a four-line edit. Every brand colour is declared once, at the top
of `styles.css`, and nothing else in the file hard-codes a colour:

```css
:root {
  --brand: #0e5a3a;       /* deep green — header, buttons, dark sections */
  --brand-deep: #093d27;  /* darker green — footer, hover states */
  --gold: #c9922e;        /* gold — hairlines, eyebrows, the logo mark */
  --accent: #c8102e;      /* red — used sparingly, for emphasis */
}
```

Put the packaging's real hex values in and the whole site follows. Two other
spots carry a copy of the colour and need the same values by hand, because they
are outside the stylesheet:

- `index.html`, the `theme-color` meta tag (the browser chrome colour on mobile).
- `index.html`, the `rel="icon"` data URI (the favicon).

Both are near the top of `<head>` and both are commented.

### The logo

The mark in the header is a placeholder: a green badge with two gold gazelle
horns, drawn as inline SVG so the page needs no image files. **Replace it with
the real Noor Gazal logo.** Drop the artwork in beside `index.html` and swap the
`<svg class="wordmark__mark">` block for an `<img>`; the surrounding layout does
not care which it is.

### The copy

Section copy is the company's **own published wording**, recovered from the
existing site and its indexed pages rather than rewritten: the founding story
("around three decades back from today the idea of Gazal Al Khadra Trading was
conceived…"), the market-position and single-brand statements, the four
vision-and-mission points, the ISO 22000:2005 and HACCP certification line, and
the Kadhara facility description. Where the redesign needed a heading or a link
label the original did not have, that is new writing; every factual claim on the
page traces back to the company's material.

**What is still missing is the product catalogue.** The five category cards say
what the company says about each category, but no per-SKU list, pack size or
case configuration was recoverable. Replace those five card bodies with the real
catalogue when you have it — they are the only place on the page written to the
category rather than to the products.

Two things in `index.html` need checking before this goes live:

- **The telephone numbers** are marked `CONFIRM ME`. They came from trade
  directory listings (Dun & Bradstreet, Made in Oman Gate, SearchArabia), not
  from the company, so confirm both against the published numbers.
- **The postal address, facility location and email** match the company's
  published details, but are worth a glance for the same reason.

---

## Previewing it before anything is deployed

`build-demo.mjs` folds the site into a single self-contained `demo.html` that
can be opened by double-clicking it, emailed, or published anywhere:

```bash
node gazalfoods/build-demo.mjs
```

It is generated from `index.html` and `styles.css` rather than maintained by
hand, so it cannot drift from the site that actually ships. Re-run it after any
edit. `demo.html` is gitignored for that reason — the script is the source, the
file is the output.

Three deliberate differences from the real site:

1. **The CSS is inlined**, because the demo has to be one file.
2. **It is marked as a proposal** — a strip across the top and a pill in the
   header — so nobody can mistake it for the published gazalfoods.net.
3. **The enquiry form is inert.** Every field is visible so the layout can be
   judged, but submitting says plainly that nothing was sent. A preview form with
   a working Send button silently swallows whatever anyone types into it.

`demo.html` is not part of the site — do not upload it.

---

## Before you upload — one edit (plus the checks above)

**`contact.php`, lines 25 and 28.** Set where enquiries go:

```php
const NOTIFY_TO   = 'info@gazalfoods.net';      // where enquiries are emailed
const NOTIFY_FROM = 'website@gazalfoods.net';   // must be on YOUR domain
```

`NOTIFY_FROM` has to be an address on gazalfoods.net. Putting the visitor's
address there is what gets mail marked as spam or rejected outright — their
address goes in `Reply-To` instead, which is already handled.

---

## Upload

1. In your host's control panel, open **File Manager** → `public_html`.
2. Upload `index.html`, `styles.css`, `contact.php` and `.htaccess`, then create
   a `_leads` folder and upload the `.htaccess` from inside it.

   Faster: zip the contents of this folder, upload the zip, and use File
   Manager's **Extract**. Make sure hidden files are included — in macOS Finder
   press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> to see them, or zip from
   the terminal.
3. Issue the free SSL certificate for the domain. The `.htaccess` forces HTTPS,
   so without a certificate the site will fail to load.

### Permissions

`_leads` must be writable by PHP. If the form returns *"We could not record
that"*, set the folder to `755` in File Manager. The handler creates the folder
itself if it is missing, but only if the parent allows it.

### www or not

`.htaccess` sends `gazalfoods.net` to `www.gazalfoods.net`, matching how the
site has always been published and the canonical link in `index.html`. If you
would rather drop the www, flip the rewrite block in `.htaccess` **and** the
`<link rel="canonical">` and `og:url` tags in `index.html` together — a
canonical pointing at a host that redirects is worse than either choice on its
own.

---

## Reading your enquiries

Every submission is written to `_leads/enquiries.php` **before** any email is
sent. Shared-host `mail()` drops messages silently, so treat the file as the
real record and the email as a convenience.

Download it via File Manager. The first line is a PHP guard; the rest is one
JSON object per line:

```
<?php exit; /* Noor Gazal enquiries — one JSON object per line below. */ ?>
{"at":"2026-08-30T15:49:19+00:00","name":"…","email":"…","interest":"Export"}
```

That guard is deliberate. If the file is ever served directly — a stray config
change, a host that ignores `.htaccess` — PHP executes the `exit` and returns an
empty response instead of handing out everyone's contact details. Two layers,
because these are real people's details. The file is also in the repository's
`.gitignore`, so a live copy can never be committed by accident.

---

## What protects the form

- **Honeypot field** — invisible to people, filled in by bots. Submissions with
  it set get a cheerful "thank you" and are discarded, because telling a bot it
  failed just invites a retry.
- **Rate limit** — 5 submissions per IP per hour. Enough to stop a script
  hammering the form; not a security boundary.
- **Control characters stripped** from every field before the value goes
  anywhere near a mail header.
- **Server-side validation**, so a crafted POST that skips the browser still
  gets checked — including the enquiry type, which is matched against a fixed
  list rather than trusted.

---

## Local preview

```bash
cd gazalfoods
php -S 127.0.0.1:8099
```

Then open <http://127.0.0.1:8099>. The form works end to end; `mail()` won't
send anything locally, but the enquiry still lands in `_leads/enquiries.php`.

One difference from production: PHP's built-in server ignores `.htaccess`, so
none of the redirects, headers or blocking rules apply locally. Apache will
honour all of them.

---

## Accessibility and performance notes

- Skip link, visible focus rings, labelled form fields, and a `<nav>` that works
  from the keyboard.
- The page is a complete static document with JavaScript off. The one inline
  script only adds the mobile menu, the header shadow, and reveal-on-scroll —
  and reveal-on-scroll is armed by that script, so content is visible by default
  rather than hidden waiting for it.
- `prefers-reduced-motion` disables every transition and the smooth scroll.
- No webfonts, no images, no third-party requests: the whole site is roughly
  50 KB and renders on a poor connection.
