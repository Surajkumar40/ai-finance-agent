
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
    throw new Error(`Email provider answered ${res.status}: ${detail}`);
  }
}

// Returns { sent: true, provider } or { sent: false, provider: null } when no provider is set up.
// Throws when a provider is set up but refuses the email (wrong key, unverified sender, and so on).
async function sendMail({ to, subject, text, html }) {
  const p = provider();
  if (p === 'brevo') {
    await post('https://api.brevo.com/v3/smtp/email', { 'api-key': process.env.BREVO_API_KEY }, {
      sender: { email: process.env.MAIL_FROM_EMAIL, name: process.env.MAIL_FROM_NAME || 'Finance AI' },
      to: [{ email: to }],
      subject, textContent: text, htmlContent: html,
    });
    return { sent: true, provider: p };
  }
  if (p === 'resend') {
    await post('https://api.resend.com/emails', { authorization: `Bearer ${process.env.RESEND_API_KEY}` }, {
      from: process.env.MAIL_FROM, to: [to], subject, text, html,
    });
    return { sent: true, provider: p };
  }
  console.log(`\n📧 [email not sent: no provider configured]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
  return { sent: false, provider: null };
}

module.exports = { sendMail, provider };