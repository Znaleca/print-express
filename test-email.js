
async function testEmail() {
  console.log("Testing with API Key:", process.env.RESEND_API_KEY ? "Set" : "Not Set");
  console.log("Testing with FROM:", process.env.EMAIL_FROM);
  
  try {
    const { sendResendEmail } = await import("./lib/resendEmail.js");

    const { data, error } = await sendResendEmail({
      from: process.env.EMAIL_FROM || "Press & Present <noreply@pressandpresent.me>",
      to: ["test@example.com"], // Using a dummy email to see if it accepts the request
      subject: "Test",
      html: "<p>Test</p>"
    });
    
    if (error) {
      console.error("Resend API returned error:", error);
    } else {
      console.log("Success! Data:", data);
    }
  } catch (err) {
    console.error("Caught error:", err);
  }
}

testEmail();
