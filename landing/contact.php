<?php
/**
 * Kambio landing page — demo request handler.
 *
 * Deliberately dependency-free so it runs on plain shared hosting.
 *
 * Every submission is written to disk FIRST and emailed second. Shared-host
 * mail() is unreliable and silently drops messages, so the file is the record
 * of truth — if an email never arrives, the lead is still in _leads/.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// CHANGE ME — the two lines below are the only configuration.
// ---------------------------------------------------------------------------

/** Where demo requests are emailed. */
const NOTIFY_TO = 'hello@kambio.example';

/** From address. MUST be on your own domain or the mail will be spam-filtered. */
const NOTIFY_FROM = 'website@kambio.example';

// ---------------------------------------------------------------------------

const LEAD_DIR = __DIR__ . '/_leads';

/**
 * The lead store is a .php file, not a .txt or .json one, and its first line
 * is an exit guard. Real people's contact details should not be one
 * misconfigured .htaccess away from being downloadable — if this file is ever
 * served directly, PHP runs the guard and returns nothing.
 * Read it by downloading it over SFTP or File Manager; skip the first line.
 */
const LEAD_FILE = LEAD_DIR . '/leads.php';
const LEAD_GUARD = "<?php exit; /* Kambio leads — one JSON object per line below. */ ?>\n";
const MAX_PER_HOUR = 5;          // per IP address
const MAX_FIELD_LEN = 4000;

/** True when the browser asked for JSON (our fetch() call does). */
function wants_json(): bool
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    return str_contains($accept, 'application/json');
}

/** Send the response in whichever format the caller expects, then stop. */
function respond(bool $ok, string $message, int $status = 200): never
{
    http_response_code($status);

    if (wants_json()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $message]);
        exit;
    }

    // No-JS fallback: a plain page in the site's colours.
    $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $heading = $ok ? 'Thank you' : 'Something went wrong';
    header('Content-Type: text/html; charset=utf-8');
    echo <<<HTML
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{$heading} — Kambio</title>
        <link rel="stylesheet" href="styles.css" />
      </head>
      <body>
        <main class="container section" style="max-width:36rem">
          <a href="/" class="wordmark">kambio<span>.</span></a>
          <h1 style="margin-top:2rem;font-size:1.75rem">{$heading}</h1>
          <p style="margin-top:1rem;color:var(--muted);line-height:1.7">{$safe}</p>
          <p style="margin-top:2rem"><a class="btn btn--ghost" href="/">Back to the site</a></p>
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
    respond(false, 'This endpoint only accepts form submissions.', 405);
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
    respond(false, 'Too many submissions from this address. Please try again later.', 429);
}

// ---------------------------------------------------------------- validation

$name    = field('name');
$email   = field('email');
$company = field('company');
$volume  = field('volume');
$message = field('message');

if (mb_strlen($name) < 2) {
    respond(false, 'Please tell us your name.', 422);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'Please enter a valid email address.', 422);
}
if (mb_strlen($company) < 2) {
    respond(false, 'Please tell us your company name.', 422);
}

// -------------------------------------------------------------------- record

$lead = [
    'at'      => gmdate('c'),
    'name'    => $name,
    'email'   => $email,
    'company' => $company,
    'volume'  => $volume,
    'message' => $message,
    'ip'      => $ip,
    'ua'      => mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
];

$line = json_encode($lead, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
$payload = file_exists(LEAD_FILE) ? $line : LEAD_GUARD . $line;

$written = @file_put_contents(LEAD_FILE, $payload, FILE_APPEND | LOCK_EX);

if ($written === false) {
    // Nothing was saved and mail alone is not dependable — say so honestly
    // rather than showing a thank-you for a lead that vanished.
    error_log('[kambio] could not write lead to ' . LEAD_FILE);
    respond(false, 'We could not record that. Please email us directly.', 500);
}

// ---------------------------------------------------------------------- mail

$subject = sprintf('Kambio demo request — %s (%s)', $company, $name);
$body = "New demo request from the Kambio site.\n\n"
    . "Name:     {$name}\n"
    . "Email:    {$email}\n"
    . "Company:  {$company}\n"
    . "Volume:   " . ($volume !== '' ? $volume : '—') . "\n"
    . "When:     " . gmdate('D, d M Y H:i') . " UTC\n\n"
    . "Message:\n" . ($message !== '' ? $message : '(none given)') . "\n";

// From must be our own domain; the visitor's address goes in Reply-To so that
// hitting reply reaches them without us forging their domain.
$headers = implode("\r\n", [
    'From: Kambio Website <' . NOTIFY_FROM . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=utf-8',
    'X-Mailer: PHP/' . phpversion(),
]);

@mail(NOTIFY_TO, $subject, $body, $headers);

respond(true, 'Thank you — we have your details and will be in touch shortly.');
