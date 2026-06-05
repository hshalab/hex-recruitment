const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://thrivecareer.co.uk'

/**
 * Shared branded email shell for every code-sent (Resend) email.
 *
 * Brand: light/white, warm-professional, matches the app. The header shows
 * the app's logo — the bright-yellow (#FFE500) rounded "T" mark + a dark
 * "Thrive" wordmark on white (yellow stays legible because it's the mark,
 * not text-on-white). Body is white with dark text and generous whitespace.
 * The single CTA button (ctaButton) is the ONLY place yellow is used as a
 * fill. Footer signs off as "The Thrive Team". ~600px, single column,
 * inline CSS (email clients require inline styles — no external/Tailwind).
 *
 * Signatures are unchanged (emailLayout / ctaButton / BASE_URL) so every
 * existing template re-brands automatically.
 */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${title}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e8eaed;border-radius:14px;overflow:hidden;">
          <!-- Header: yellow T-mark + dark "Thrive" wordmark on white -->
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #eef0f3;">
              <a href="${BASE_URL}" style="text-decoration:none;">
                <img src="${BASE_URL}/logo/thrive-mark-192.png" alt="Thrive" width="34" height="34" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;" />
                <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">Thrive</span>
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;background-color:#ffffff;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer: "The Thrive Team" sign-off -->
          <tr>
            <td style="padding:24px 32px 28px;background-color:#fbfbfc;border-top:1px solid #eef0f3;text-align:center;">
              <p style="margin:0 0 10px;font-size:14px;color:#334155;font-weight:600;">— The Thrive Team</p>
              <p style="margin:0 0 10px;font-size:13px;color:#94a3b8;line-height:1.5;">
                Thrive · hospitality hiring made simple<br />
                <a href="${BASE_URL}" style="color:#64748b;text-decoration:none;">thrivecareer.co.uk</a>
              </p>
              <p style="margin:0;font-size:12px;color:#a8b0bd;">
                <a href="${BASE_URL}/settings/notifications" style="color:#a8b0bd;text-decoration:underline;">Manage email preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="${BASE_URL}/privacy-policy" style="color:#a8b0bd;text-decoration:underline;">Privacy</a>
                &nbsp;&middot;&nbsp;&copy; 2026 Thrive
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * The single primary call-to-action. Yellow fill (#FFE500), dark text — the
 * only yellow fill in any email. One per email.
 */
export function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
  <tr>
    <td style="background-color:#FFE500;border-radius:9px;">
      <a href="${url}" style="display:inline-block;padding:14px 30px;color:#0f172a;font-size:15px;font-weight:700;text-decoration:none;border-radius:9px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`
}

export { BASE_URL }
