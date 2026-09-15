import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { isValidEmail, normalizeEmail, SIGNUP_ROLES, validatePassword } from "@/lib/auth";
import { normalizePhilippinePhone } from "@/lib/phone";
import { getAuthRedirectUrl } from "@/lib/appUrl";
import { sendAuthVerificationEmail } from "@/lib/authVerificationEmail";

export const dynamic = "force-dynamic";

const SIGNUP_FAILURE_MESSAGE = "We could not create your account. This email may already be taken—try signing in or resetting your password.";
const SIGNUP_PROVIDER_FAILURE_MESSAGE = "We could not complete signup right now. Please try again.";

function cleanText(value) {
  return String(value || "").trim();
}

function getSignupErrorCode(error) {
  const code = String(error?.code || "").trim().toLowerCase();
  if (code) return code.slice(0, 80).replace(/[^a-z0-9_.-]/g, "_");
  return "unknown";
}

function isDuplicateSignupError(errorCode) {
  return errorCode === "email_exists" || errorCode === "user_already_exists";
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid signup request." }, { status: 400 });
    }

    const email = normalizeEmail(body?.email);
    const role = String(body?.role || "").trim().toUpperCase();
    const firstName = cleanText(body?.firstName);
    const lastName = cleanText(body?.lastName);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!SIGNUP_ROLES.includes(role)) {
      return NextResponse.json({ error: "Choose a valid account type." }, { status: 400 });
    }
    if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60 || firstName.length + lastName.length + 1 > 120) {
      return NextResponse.json({ error: "Enter a first and last name between 1 and 120 characters." }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const phone = normalizePhilippinePhone(body?.phone);
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid Philippine mobile number." }, { status: 400 });
    }

    const businessName = cleanText(body?.businessName);
    const businessBackground = cleanText(body?.businessBackground);
    const productsSummary = cleanText(body?.productsSummary);
    if (role === "BUSINESS_OWNER") {
      if (businessName.length < 2 || businessName.length > 120) {
        return NextResponse.json({ error: "Business name must be between 2 and 120 characters." }, { status: 400 });
      }
      if (businessBackground.length < 20 || businessBackground.length > 800) {
        return NextResponse.json({ error: "Business background must be between 20 and 800 characters." }, { status: 400 });
      }
      if (productsSummary.length < 10 || productsSummary.length > 500) {
        return NextResponse.json({ error: "Products and services summary must be between 10 and 500 characters." }, { status: 400 });
      }
    }

    const emailRedirectTo = getAuthRedirectUrl();
    if (!emailRedirectTo) {
      console.error("AUTH_SIGNUP_APP_URL_MISSING");
      return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error: signupError } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo: emailRedirectTo,
        data: {
          full_name: `${firstName} ${lastName}`.trim(),
          phone,
          role,
          ...(role === "BUSINESS_OWNER" ? {
            business_name: businessName,
            business_background: businessBackground,
            products_summary: productsSummary,
          } : {}),
        },
      },
    });

    if (signupError) {
      const errorCode = getSignupErrorCode(signupError);
      console.error(isDuplicateSignupError(errorCode) ? "AUTH_SIGNUP_EMAIL_MAY_BE_TAKEN" : "AUTH_SIGNUP_PROVIDER_ERROR", errorCode);
      return NextResponse.json({
        error: isDuplicateSignupError(errorCode) ? SIGNUP_FAILURE_MESSAGE : SIGNUP_PROVIDER_FAILURE_MESSAGE,
      }, { status: 503 });
    }

    if (!data?.user || !data?.properties?.action_link) {
      console.error("AUTH_SIGNUP_NO_USER_RESPONSE");
      return NextResponse.json({ error: SIGNUP_PROVIDER_FAILURE_MESSAGE }, { status: 503 });
    }

    const { error: emailError } = await sendAuthVerificationEmail({
      email,
      actionLink: data.properties.action_link,
    });
    if (emailError) {
      console.error("AUTH_SIGNUP_EMAIL_DELIVERY_FAILED", emailError.code || "unknown");
      return NextResponse.json({ error: "We could not send the verification email. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      email,
      role,
      verificationRequired: true,
      message: "Account created. Check your email and verify your account before logging in.",
    }, { status: 201 });
  } catch {
    console.error("AUTH_SIGNUP_UNAVAILABLE");
    return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
