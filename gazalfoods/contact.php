<?php
/**
 * Noor Gazal — enquiry handler.
 *
 * Deliberately dependency-free so it runs on plain shared hosting: no composer,
 * no database, no framework.
 *
 * Every enquiry is written to disk FIRST and emailed second. Shared-host mail()
 * is unreliable and drops messages silently, so the file is the record of truth
 * — if an email never arrives, the enquiry is still in _leads/.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// CHANGE ME — where enquiries go.
// NOTIFY_FROM must be an address on gazalfoods.net, or the mail gets
// spam-filtered. The visitor's own address goes in Reply-To instead.
// ---------------------------------------------------------------------------

/** Where enquiries are emailed. */
const NOTIFY_TO = 'info@gazalfoods.net';

/** From address. MUST be on your own domain. */
const NOTIFY_FROM = 'website@gazalfoods.net';

// ---------------------------------------------------------------------------

const LEAD_DIR = __DIR__ . '/_leads';

/**
 * The enquiry store is a .php file, not a .txt or .json one, and its first line
 * is an exit guard. Real people's contact details should not be one
 * misconfigured .htaccess away from being downloadable — if this file is ever
 * served directly, PHP runs the guard and returns nothing.
 * Read it by downloading it over SFTP or File Manager; skip the first line.
 */
const LEAD_FILE = LEAD_DIR . '/enquiries.php';
const LEAD_GUARD = "<?php exit; /* Noor Gazal enquiries — one JSON object per line below. */ ?>\n";
const MAX_PER_HOUR = 5;          // per IP address
const MAX_FIELD_LEN = 4000;

/** Send the response, then stop. */
function respond(bool $ok, string $message, int $status = 200): never
{
    http_response_code($status);

    $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $heading = $ok ? 'Thank you' : 'Something went wrong';
    $modifier = $ok ? '' : ' result__card--error';

    header('Content-Type: text/html; charset=utf-8');
    echo <<<HTML
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{$heading} — Noor Gazal</title>
        <link rel="stylesheet" href="styles.css" />
      </head>
      <body>
        <main class="container result">
          <div class="result__card{$modifier}">
            <h1>{$heading}</h1>
            <p>{$safe}</p>
            <a class="btn btn--primary" href="/">Back to the site</a>
          </div>
        </main>
      </body>
    </html>
    HTML;
    exit;
}

/** Trim, cap length, and strip control characters that could forge headers. */
function field(string $key): string
{
    $raw = (string) ($_POST[$key] ?? '');
    $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $raw) ?? '';
    return mb_substr(trim($clean), 0, MAX_FIELD_LEN);
}

/**
 * Crude per-IP throttle. Counts this hour's submissions in a per-IP file.
 * Good enough to stop a script hammering the form; not a security boundary.
 */
function rate_limited(string $dir, string $ip): bool
{
    $file = $dir . '/.rate-' . sha1($ip) . '.txt';
    $hour = gmdate('YmdH');

    $count = 0;
    if (is_readable($file)) {
        [$storedHour, $storedCount] = array_pad(explode(':', (string) file_get_contents($file), 2), 2, '0');
        if ($storedHour === $hour) {
            $count = (int) $storedCount;
        }
    }

    if ($count >= MAX_PER_HOUR) {
        return true;
    }

    @file_put_contents($file, $hour . ':' . ($count + 1), LOCK_EX);
    return false;
}

// --------------------------------------------------------------------- guard

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    respond(false, 'This page only accepts enquiries sent from the contact form.', 405);
}

// Honeypot: a real person never sees this input, so anything in it is a bot.
// Answer as if it succeeded — telling a bot it failed only invites a retry.
if (field('website') !== '') {
    respond(true, 'Thank you.');
}

$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

if (!is_dir(LEAD_DIR)) {
    @mkdir(LEAD_DIR, 0750, true);
}

if (rate_limited(LEAD_DIR, $ip)) {
    respond(false, 'Too many enquiries from this address. Please try again a little later.', 429);
}

// ---------------------------------------------------------------- validation

$name     = field('name');
$email    = field('email');
$company  = field('company');
$phone    = field('phone');
$interest = field('interest');
$message  = field('message');

if (mb_strlen($name) < 2) {
    respond(false, 'Please tell us your name so we know who to reply to.', 422);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'Please enter a valid email address.', 422);
}

// Only accept an interest we actually offer; anything else is a crafted POST.
$allowedInterests = ['Stockist', 'Wholesale', 'Export', 'Product', 'Other'];
if (!in_array($interest, $allowedInterests, true)) {
    $interest = 'Other';
}

// -------------------------------------------------------------------- record

$enquiry = [
    'at'       => gmdate('c'),
    'name'     => $name,
    'email'    => $email,
    'company'  => $company,
    'phone'    => $phone,
    'interest' => $interest,
    'message'  => $message,
    'ip'       => $ip,
    'ua'       => mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
];

$line = json_encode($enquiry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
$payload = file_exists(LEAD_FILE) ? $line : LEAD_GUARD . $line;

$written = @file_put_contents(LEAD_FILE, $payload, FILE_APPEND | LOCK_EX);

if ($written === false) {
    // Nothing was saved and mail alone is not dependable — say so honestly
    // rather than showing a thank-you for an enquiry that vanished.
    error_log('[noorgazal] could not write enquiry to ' . LEAD_FILE);
    respond(false, 'We could not record that. Please email us directly at ' . NOTIFY_TO . '.', 500);
}

// ---------------------------------------------------------------------- mail

$subject = sprintf('Website enquiry (%s) — %s', $interest, $name);
$body = "New enquiry from gazalfoods.net.\n\n"
    . "Name:     {$name}\n"
    . "Email:    {$email}\n"
    . "Phone:    " . ($phone !== '' ? $phone : '—') . "\n"
    . "Company:  " . ($company !== '' ? $company : '—') . "\n"
    . "About:    {$interest}\n"
    . "When:     " . gmdate('D, d M Y H:i') . " UTC\n\n"
    . "Message:\n" . ($message !== '' ? $message : '(none given)') . "\n";

// From must be our own domain; the visitor's address goes in Reply-To so that
// hitting reply reaches them without us forging their domain.
$headers = implode("\r\n", [
    'From: Noor Gazal Website <' . NOTIFY_FROM . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=utf-8',
    'X-Mailer: PHP/' . phpversion(),
]);

@mail(NOTIFY_TO, $subject, $body, $headers);

respond(true, 'We have your enquiry and will be in touch shortly.');
