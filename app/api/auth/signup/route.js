import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabasePublicServerClient } from "@/lib/supabasePublicServer";
import { isValidEmail, normalizeEmail, SIGNUP_ROLES, validatePassword } from "@/lib/auth";
import { normalizePhilippinePhone } from "@/lib/phone";
import { getAuthRedirectUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

const DUPLICATE_MESSAGES = {
  verified: "An account with this email already exists. Please log in instead or reset your password.",
  unverified: "This email is already registered but not verified. Check your inbox or resend the verification email.",
};

function duplicateResponse(account) {
  const isVerified = Boolean(account?.email_confirmed_at);
  return NextResponse.json({
    error: isVerified ? DUPLICATE_MESSAGES.verified : DUPLICATE_MESSAGES.unverified,
    code: isVerified ? "EMAIL_EXISTS_VERIFIED" : "EMAIL_EXISTS_UNVERIFIED",
    canResend: !isVerified,
  }, { status: 409 });
}

function cleanText(value) {
  return String(value || "").trim();
}

async function findAuthAccount(supabase, email) {
  const { data, error } = await supabase.rpc("get_auth_user_status_by_email", {
    lookup_email: email,
  });

  if (error) return { account: null, error };
  return { account: Array.isArray(data) ? data[0] || null : data || null, error: null };
}

async function recheckDuplicate(supabase, email) {
  const { account, error } = await findAuthAccount(supabase, email);
  if (error) {
    console.error("AUTH_SIGNUP_DUPLICATE_RECHECK_FAILED");
    return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
  }
  return account ? duplicateResponse(account) : null;
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

    const admin = getSupabaseAdminClient();
    const { account, error: lookupError } = await findAuthAccount(admin, email);
    if (lookupError) {
      console.error("AUTH_SIGNUP_LOOKUP_FAILED");
      return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
    }
    if (account) return duplicateResponse(account);

    const emailRedirectTo = getAuthRedirectUrl();
    if (!emailRedirectTo) {
      console.error("AUTH_SIGNUP_APP_URL_MISSING");
      return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
    }

    const publicClient = getSupabasePublicServerClient();
    const { data, error: signupError } = await publicClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
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
      const duplicate = await recheckDuplicate(admin, email);
      if (duplicate) return duplicate;

      console.error("AUTH_SIGNUP_FAILED");
      return NextResponse.json({ error: "We could not create your account right now. Please try again." }, { status: 503 });
    }

    // With email confirmation enabled, Supabase returns a user with no session.
    // If the auth project is configured differently, the identities check still
    // catches the duplicate-user response that Supabase intentionally obscures.
    if (!data?.user || data.user.identities?.length === 0) {
      const duplicate = await recheckDuplicate(admin, email);
      if (duplicate) return duplicate;
      console.error("AUTH_SIGNUP_MISSING_USER");
      return NextResponse.json({ error: "We could not create your account right now. Please try again." }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      email,
      role,
      verificationRequired: !data.user.email_confirmed_at,
      message: "Account created. Check your email and verify your account before logging in.",
    }, { status: 201 });
  } catch {
    console.error("AUTH_SIGNUP_UNAVAILABLE");
    return NextResponse.json({ error: "Authentication is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
