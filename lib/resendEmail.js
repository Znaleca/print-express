const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendResendEmail({ from, to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      data: null,
      error: { message: "Missing RESEND_API_KEY" },
    };
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const responseText = await response.text();
  let responseData = null;
  try {
    responseData = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseData = responseText ? { message: responseText } : null;
  }

  if (!response.ok) {
    return {
      data: null,
      error: responseData || { message: "Resend request failed" },
    };
  }

  return {
    data: responseData,
    error: null,
  };
}
