// Sends email through an HTTPS API (not SMTP). Render's free plan blocks SMTP ports, but HTTPS always works.
// Pick ONE provider by setting its variables in backend/.env on Render:
//
//   Brevo  (free: 300 emails a day, no domain needed, you only verify your own email address)
//     BREVO_API_KEY=xkeysib-...
//     MAIL_FROM_EMAIL=you@gmail.com      <- the sender address you verified in Brevo
//     MAIL_FROM_NAME=Finance AI          <- optional
//
//   Resend (free, but sending to other people needs your own verified domain)
//     RESEND_API_KEY=re_...
//     MAIL_FROM="Finance AI <noreply@yourdomain.com>"
//
// With neither set (for example on your own computer) the email is not sent: its text is printed in the terminal instead.

const TIMEOUT_MS = 10000;

function provider() {
  if (process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL) return 'brevo';
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return 'resend';
  return null;
}

// Says what is wrong with the settings, in words. Used at start-up and whenever an email cannot be sent.
function setupProblem() {
  if (provider()) return null;
  if (process.env.BREVO_API_KEY && !process.env.MAIL_FROM_EMAIL) return 'BREVO_API_KEY is set but MAIL_FROM_EMAIL is missing. Add MAIL_FROM_EMAIL=<the sender email you verified in Brevo>.';
  if (process.env.MAIL_FROM_EMAIL && !process.env.BREVO_API_KEY) return 'MAIL_FROM_EMAIL is set but BREVO_API_KEY is missing. Add BREVO_API_KEY=<your Brevo API key>.';
  if (process.env.RESEND_API_KEY && !process.env.MAIL_FROM) return 'RESEND_API_KEY is set but MAIL_FROM is missing.';
  return 'No email service is set up. Add BREVO_API_KEY and MAIL_FROM_EMAIL to backend/.env.';
}

// One clear line in the server log when it starts, so you can see straight away if the settings were picked up.
function describe() {
  const p = provider();
  if (p === 'brevo') return `📧 Email is ON (Brevo). Mails are sent from ${process.env.MAIL_FROM_EMAIL}`;
  if (p === 'resend') return `📧 Email is ON (Resend). Mails are sent from ${process.env.MAIL_FROM}`;
  return `📧 Email is OFF. ${setupProblem()} Until then, reset links are only printed in this log.`;
}
console.log(describe());

// Turns the provider's answer into a hint about what to fix.
function hintFor(status, detail) {
  const d = String(detail || '').toLowerCase();
  if (status === 401 || status === 403 && /key/.test(d)) return 'The API key was rejected. Make sure it is copied in full, with no spaces or quotes, and that it is an API key (not the SMTP password).';
  if (/sender|from|not verified|not valid|unverified/.test(d)) return 'The sender address is not verified. In your email service, verify the exact address you put in MAIL_FROM_EMAIL.';
  if (/activ|validat|not enabled|permission|not allowed/.test(d)) return 'The account may still need to be activated for sending. Check the email service dashboard or its support.';
  if (status === 429) return 'Daily sending limit reached. Try again tomorrow.';
  return '';
}

async function post(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    const hint = hintFor(res.status, detail);
    throw new Error(`Email provider answered ${res.status}: ${detail}${hint ? ' | HINT: ' + hint : ''}`);
  }
  try { return await res.json(); } catch { return {}; }
}

// Returns { sent: true, provider } or { sent: false, provider: null } when no provider is set up.
// Throws when a provider is set up but refuses the email (wrong key, unverified sender, and so on).
async function sendMail({ to, subject, text, html }) {
  const p = provider();
  if (p === 'brevo') {
    const out = await post('https://api.brevo.com/v3/smtp/email', { 'api-key': process.env.BREVO_API_KEY }, {
      sender: { email: process.env.MAIL_FROM_EMAIL, name: process.env.MAIL_FROM_NAME || 'Finance AI' },
      to: [{ email: to }],
      subject, textContent: text, htmlContent: html,
    });
    return { sent: true, provider: p, messageId: out?.messageId || null };
  }
  if (p === 'resend') {
    const out = await post('https://api.resend.com/emails', { authorization: `Bearer ${process.env.RESEND_API_KEY}` }, {
      from: process.env.MAIL_FROM, to: [to], subject, text, html,
    });
    return { sent: true, provider: p, messageId: out?.id || null };
  }
  console.log(`\n📧 [email NOT sent] ${setupProblem()}\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
  return { sent: false, provider: null };
}

// ---------- delivery check (Brevo only) ----------
// Asks Brevo what happened to the mails sent to one address in the last day.
async function brevoEvents(to) {
  const url = `https://api.brevo.com/v3/smtp/statistics/events?email=${encodeURIComponent(to)}&days=1&limit=30&sort=desc`;
  const res = await fetch(url, { headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    let d = ''; try { d = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`Brevo events lookup answered ${res.status}: ${d}${res.status === 401 || res.status === 403 ? ' | HINT: the API key may not be allowed to read statistics.' : ''}`);
  }
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body.events) ? body.events : [];
}

const BAD = ['blocked', 'hardBounces', 'bounces', 'softBounces', 'invalid', 'spam', 'error', 'deferred'];

// Turns Brevo's events for one message into a plain answer. events are newest first.
function verdict(events, from) {
  const list = (events || []).map((e) => ({ event: e.event, reason: e.reason || '', date: e.date }));
  if (!list.length) return { status: 'unknown', text: 'Brevo has no record of this mail yet. Wait a minute and open the link again. If it stays empty, the API key probably belongs to a different Brevo account than the one you are looking at.' };
  const bad = list.find((e) => BAD.includes(e.event));
  const freeMail = /@(gmail|yahoo|outlook|hotmail|rediffmail|icloud)\./i.test(from || '');
  if (bad) {
    let advice = 'Brevo could not deliver it.';
    const r = bad.reason.toLowerCase();
    if (bad.event === 'blocked' || /block|sender|not valid|not verified|inactive|suspend/.test(r)) advice = 'Brevo blocked this mail. Usually the sender address is not verified, or the Brevo account is not activated for sending yet. Open Brevo → Senders, Domains & IPs → Senders and make sure the sender shows as verified, then check for an account activation banner or email from Brevo.';
    else if (bad.event === 'hardBounces' || bad.event === 'invalid') advice = 'The receiving address does not exist or refuses mail. Check the spelling of the address you typed.';
    else if (bad.event === 'spam') advice = 'The receiver marked it as spam.';
    else if (bad.event === 'softBounces' || bad.event === 'deferred') advice = 'The receiving mail server pushed it back for now (mailbox full, rate limits or a strict spam filter).';
    if (freeMail && ['blocked', 'spam', 'softBounces', 'deferred', 'bounces'].includes(bad.event)) advice += ' Your sender is a free-mail address (Gmail, Yahoo...). These often get rejected or filtered when sent through a service like Brevo. A sender on your own domain, with Brevo domain authentication, fixes this.';
    return { status: 'problem', event: bad.event, reason: bad.reason, text: advice };
  }
  if (list.some((e) => e.event === 'delivered')) return { status: 'delivered', text: 'Delivered: the receiving mail server accepted it. If you cannot see it, look in Spam, Promotions and All Mail, and search for "Finance AI".' + (freeMail ? ' Free-mail senders are often filed under Spam at first.' : '') };
  return { status: 'pending', text: 'Brevo accepted the mail and is still delivering it. Open this link again in a minute.' };
}

module.exports = { sendMail, provider, setupProblem, describe, brevoEvents, verdict };