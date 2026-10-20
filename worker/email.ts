import { escapeHtml } from '../shared/markdown';
import { SITE, taka } from '../shared/site';

interface Mail {
  to: string;
  subject: string;
  /** Short paragraphs of plain text. */
  lines: string[];
  button?: { label: string; url: string };
  footer?: string;
}

/** Sends through Resend. Without RESEND_API_KEY (local development) the email is printed to the log instead. */
export async function sendEmail(env: Env, mail: Mail) {
  const html = render(mail);
  const text = [...mail.lines, mail.button ? `${mail.button.label}: ${mail.button.url}` : '', mail.footer ?? ''].filter(Boolean).join('\n\n');
  if (!env.RESEND_API_KEY) {
    console.log(`[email] to=${mail.to} subject="${mail.subject}"\n${text}`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], reply_to: env.EMAIL_REPLY_TO || undefined, subject: mail.subject, html, text }),
  });
  if (!response.ok) throw new Error(`Resend failed (HTTP ${response.status}): ${await response.text()}`);
}

const FLAME = 'https://2bytes.dev/logo-mark.png';

function render(mail: Mail) {
  const paragraphs = mail.lines
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#27272a">${escapeHtml(line)}</p>`).join('');
  const button = mail.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(mail.button.url)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:10px">${escapeHtml(mail.button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#71717a">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(mail.button.url)}</span></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7">
  <tr><td style="padding:28px 28px 8px"><img src="${FLAME}" width="34" height="26" alt="" style="vertical-align:middle"> <span style="font-size:18px;font-weight:700;color:#0a0a0a;vertical-align:middle">${SITE.name}</span></td></tr>
  <tr><td style="padding:16px 28px 12px"><h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0a0a0a">${escapeHtml(mail.subject)}</h1>${paragraphs}${button}</td></tr>
  <tr><td style="padding:16px 28px 28px;border-top:1px solid #f4f4f5;font-size:12px;line-height:1.5;color:#a1a1aa">${escapeHtml(mail.footer ?? `${SITE.name} · Made by ${SITE.founders.join(' & ')}`)}</td></tr>
  </table></td></tr></table></body></html>`;
}

export function purchaseEmail(to: string, name: string, items: { title: string }[], total: number, link: string): Mail {
  const titles = items.map((item) => item.title);
  return {
    to,
    subject: titles.length === 1 ? `You're in: ${titles[0]}` : 'Your courses are ready',
    lines: [
      `Hi ${name.split(' ')[0] || 'there'},`,
      `Thanks for your purchase${total ? ` (${taka(total)})` : ''}. You now have lifetime access to ${titles.join(' and ')}.`,
      'Use the button below to open your course area. No password needed: the link signs you in on this device. It works once and expires in 7 days, and you can always get a new one from the sign-in page with this email address.',
    ],
    button: { label: 'Start learning', url: link },
  };
}

export function loginEmail(to: string, link: string): Mail {
  return {
    to,
    subject: `Sign in to ${SITE.name}`,
    lines: ['Use the button below to open your courses. The link works once and expires in 30 minutes.', "If you didn't ask for this, you can ignore this email."],
    button: { label: 'Open my courses', url: link },
  };
}
