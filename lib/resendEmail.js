const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendResendEmail({ from, to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      data: null,
      error: { code: "RESEND_NOT_CONFIGURED", message: "Email service is not configured." },
    };
  }

  try {
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (!from || !recipients.length || !subject || !html || recipients.some((recipient) => !EMAIL_PATTERN.test(String(recipient).trim()))) {
      return { data: null, error: { code: "INVALID_EMAIL_REQUEST", message: "Email request is invalid." } };
    }

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Press-and-Present/1.0",
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });

    const responseText = await response.text();
    let responseData = null;
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseData = null;
    }

    if (!response.ok) {
      return {
        data: null,
        error: {
          code: response.status === 429 ? "RESEND_RATE_LIMITED" : "RESEND_REQUEST_FAILED",
          status: response.status,
          message: response.status === 429
            ? "Email service rate limit reached."
            : "Email service rejected the request.",
        },
      };
    }

    return { data: responseData, error: null };
  } catch {
    return {
      data: null,
      error: { code: "RESEND_NETWORK_ERROR", message: "Email service is temporarily unavailable." },
    };
  }
}
