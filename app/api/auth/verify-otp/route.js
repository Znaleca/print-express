import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  hashOtp,
  safeEqualHex,
} from "@/lib/otpSecurity";

const INVALID_CODE_MESSAGE = "Invalid or expired code.";

async function removeCreatedAccount(supabase, userId) {
  // Compensating cleanup keeps an auth user from being left without the
  // profile/business rows that the signup workflow promises to create.
  const { error: businessCleanupError } = await supabase.rpc("cleanup_failed_business_signup", {
    p_user_id: userId,
  });
  if (businessCleanupError) console.error("Signup business cleanup error:", businessCleanupError);

  const { error: profileCleanupError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileCleanupError) console.error("Signup profile cleanup error:", profileCleanupError);

  const { error: authCleanupError } = await supabase.auth.admin.deleteUser(userId);
  if (authCleanupError) console.error("Signup auth cleanup error:", authCleanupError);
}

async function consumeOtp(supabase, otpId) {
  const { error } = await supabase.from("otp_verifications").delete().eq("id", otpId);
  if (error) throw error;
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();

    const { email, code, type, password, userData } = await request.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedCode = String(code || "").trim();
    const normalizedType = String(type || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }
    if (!["signup", "reset"].includes(normalizedType)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const requestedRole = userData?.role || "CUSTOMER";
    if (normalizedType === "signup" && !["CUSTOMER", "BUSINESS_OWNER"].includes(requestedRole)) {
      return NextResponse.json({ error: "Invalid account type." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Password must be between 8 and 128 characters." }, { status: 400 });
    }

    let businessBackground = "";
    let productsSummary = "";
    if (normalizedType === "signup" && requestedRole === "BUSINESS_OWNER") {
      businessBackground = String(userData?.business_background || "").trim();
      productsSummary = String(userData?.products_summary || "").trim();

      if (businessBackground.length < 20 || businessBackground.length > 800) {
        return NextResponse.json({ error: "Business background must be between 20 and 800 characters." }, { status: 400 });
      }

      if (productsSummary.length < 10 || productsSummary.length > 500) {
        return NextResponse.json({ error: "Products and services summary must be between 10 and 500 characters." }, { status: 400 });
      }
    }

    const { data: verifications, error: verifyError } = await supabase
      .from("otp_verifications")
      .select("id, otp_hash, attempt_count, max_attempts")
      .eq("email", normalizedEmail)
      .eq("type", normalizedType)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (verifyError) {
      console.error("OTP lookup error:", verifyError);
      return NextResponse.json({ error: "Verification is temporarily unavailable. Please try again." }, { status: 503 });
    }

    const verification = verifications?.[0];
    let codeMatches = false;
    if (verification?.otp_hash) {
      try {
        codeMatches = safeEqualHex(
          verification.otp_hash,
          hashOtp({ email: normalizedEmail, type: normalizedType, code: normalizedCode })
        );
      } catch (hashError) {
        console.error("OTP hash comparison error:", hashError);
      }
    }

    if (!verification || !codeMatches) {
      if (verification?.id) {
        const { error: attemptError } = await supabase.rpc("register_otp_attempt", {
          p_otp_id: verification.id,
        });
        if (attemptError) console.error("OTP attempt tracking error:", attemptError);
      }
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }

    // Keep the code until the account/password workflow completes. This
    // allows signup rollback and avoids orphaned auth users on later failures.
    if (normalizedType === "signup") {
      const { role: _untrustedRole, ...safeUserMetadata } = userData || {};
      const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: safeUserMetadata,
      });

      if (createUserError || !createdUser?.user?.id) {
        console.error("Create user error:", createUserError || "Missing created user id");
        return NextResponse.json({ error: "Unable to complete verification. Please request a new code or sign in." }, { status: 400 });
      }

      const createdUserId = createdUser.user.id;
      const role = requestedRole;
      const fullName = String(userData?.full_name || "").trim();
      const phone = String(userData?.phone || "").trim();
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: createdUserId,
          email: normalizedEmail,
          full_name: fullName,
          phone,
          role,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

      if (profileError) {
        console.error("Create profile error:", profileError);
        await removeCreatedAccount(supabase, createdUserId);
        return NextResponse.json({ error: "Unable to complete account setup. Please try again." }, { status: 400 });
      }

      if (role === "BUSINESS_OWNER") {
        const businessName = String(userData?.business_name || `${fullName}'s Business`).trim();
        const { error: businessError } = await supabase
          .from("businesses")
          .insert({
            owner_id: createdUserId,
            name: businessName || "Pending Business",
            description: businessBackground,
            products_summary: productsSummary,
            status: "PENDING",
          });

        if (businessError) {
          console.error("Create business error:", businessError);
          await removeCreatedAccount(supabase, createdUserId);
          return NextResponse.json({ error: "Unable to complete business setup. Please try again." }, { status: 400 });
        }
      }

      try {
        await consumeOtp(supabase, verification.id);
      } catch (consumeError) {
        console.error("OTP consumption error after signup:", consumeError);
      }

      return NextResponse.json({ success: true, message: "User registered securely." });
    }

    const { data: userId, error: rpcError } = await supabase.rpc("get_user_id_by_email", {
      lookup_email: normalizedEmail,
    });
    if (rpcError || !userId) {
      console.error("Find user error:", rpcError || "Missing user id");
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      console.error("Update password error:", updateError);
      return NextResponse.json({ error: "Unable to update the password. Please try again." }, { status: 400 });
    }

    try {
      await consumeOtp(supabase, verification.id);
    } catch (consumeError) {
      console.error("OTP consumption error after password reset:", consumeError);
    }

    return NextResponse.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("Verify OTP API error:", err);
    return NextResponse.json({ error: "Verification is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
