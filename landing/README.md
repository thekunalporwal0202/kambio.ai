# Kambio landing page

A standalone marketing page that runs on plain shared hosting. No Node, no build
step, no database — HTML, CSS, and one PHP file for the demo-request form.

This exists because the Kambio **app** needs Postgres, Redis and a long-running
Node process, none of which shared hosting provides. The landing page has no such
needs, so it can go live today while the app is deployed properly elsewhere.

```
index.html        the whole page
styles.css        all styling (mirrors the product's dark theme)
contact.php       demo-request handler — saves to disk, then emails
.htaccess         HTTPS redirect, security headers, blocks the lead store
_leads/           where submissions are written (never web-readable)
```

---

## Before you upload — two edits

**1. `contact.php`, lines 19 and 22.** Set where demo requests go:

```php
const NOTIFY_TO   = 'you@yourdomain.com';       // where requests are emailed
const NOTIFY_FROM = 'website@yourdomain.com';   // must be on YOUR domain
```

`NOTIFY_FROM` has to be your own domain. Putting the visitor's address there is
what gets mail marked as spam or rejected outright — their address goes in
`Reply-To` instead, which is already handled.

**2. `index.html`.** Replace `kambio.example` with your real domain. It appears
in the canonical link, the Open Graph tags, and the mailto address in the contact
section. Search for `CHANGE ME` — both spots are marked.

---

## Upload to Hostinger

1. hPanel → **Files** → **File Manager**.
2. Open `public_html`. If Hostinger put a placeholder `index.html` or
   `default.php` there, delete it first.
3. Upload `index.html`, `styles.css`, `contact.php` and `.htaccess`, then create
   a `_leads` folder and upload the `.htaccess` from inside it.

   Faster: zip the contents of this folder, upload the zip, and use File
   Manager's **Extract**. Make sure hidden files are included — in macOS Finder
   press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> to see them, or zip from
   the terminal.
4. hPanel → **Websites** → **SSL** and issue the free certificate. The
   `.htaccess` forces HTTPS, so without a certificate the site will fail to load.
5. Point your domain's nameservers at Hostinger, or add an A record to the IP
   shown in hPanel. Propagation is usually minutes, occasionally a few hours.

### Permissions

`_leads` must be writable by PHP. If the form returns *"We could not record
that"*, set the folder to `755` in File Manager (right-click → Permissions). The
handler creates the folder itself if it's missing, but only if the parent allows
it.

---

## Reading your leads

Every submission is written to `_leads/leads.php` **before** any email is sent.
Shared-host `mail()` drops messages silently, so treat the file as the real
record and the email as a convenience.

Download it via File Manager. The first line is a PHP guard; the rest is one
JSON object per line:

```
<?php exit; /* Kambio leads — one JSON object per line below. */ ?>
{"at":"2026-08-09T19:07:06+00:00","name":"…","email":"…","company":"…"}
```

That guard is deliberate. If the file is ever served directly — a stray config
change, a host that ignores `.htaccess` — PHP executes the `exit` and returns an
empty response instead of handing out everyone's contact details. Two layers,
because these are real people's details.

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
  gets checked.

---

## Local preview

```bash
cd landing
php -S 127.0.0.1:8099
```

Then open <http://127.0.0.1:8099>. The form works end to end; `mail()` won't send
anything locally, but the lead still lands in `_leads/leads.php`.

One difference from production: PHP's built-in server ignores `.htaccess`, so
none of the redirects or blocking rules apply locally. Apache on Hostinger will
honour all of them.

---

## When the app goes live

This page and the app are separate deployments. Once the app is running on a
VPS or a platform host, either:

- point a subdomain (`app.yourdomain.com`) at it and change the CTAs here to
  link there, or
- move the whole domain to the app and retire this page — the Next.js marketing
  site under `src/app/(marketing)/` is the richer version of the same content,
  with pricing, demo and contact as real pages.

The copy here is kept deliberately in sync with that version, so nothing is lost
either way.
