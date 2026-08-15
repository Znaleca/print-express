import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

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
      return NextResponse.json({ error: "Enter the 6-digit verification code." }, { status: 400 });
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

    // 1. Verify OTP in database
    const { data: verifications, error: verifyError } = await supabase
      .from("otp_verifications")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("type", normalizedType)
      .eq("otp_code", normalizedCode)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (verifyError || !verifications || verifications.length === 0) {
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
    }

    // 2. Delete the used code
    await supabase.from("otp_verifications").delete().eq("id", verifications[0].id);

    // 3. Process Based on Type
    if (normalizedType === "signup") {
      if (requestedRole === "BUSINESS_OWNER") {
        const businessBackground = (userData?.business_background || "").trim();
        const productsSummary = (userData?.products_summary || "").trim();

        if (businessBackground.length < 20 || businessBackground.length > 800) {
          return NextResponse.json({ error: "Business background must be between 20 and 800 characters." }, { status: 400 });
        }

        if (productsSummary.length < 10 || productsSummary.length > 500) {
          return NextResponse.json({ error: "Products and services summary must be between 10 and 500 characters." }, { status: 400 });
        }
      }
      
      // Auto-confirm the user during creation since they already verified the code
      const { data: user, error: createUserError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: password,
        email_confirm: true,
        user_metadata: userData || {},
      });

      if (createUserError) {
        console.error("Create user error:", createUserError);
        return NextResponse.json({ error: createUserError.message }, { status: 400 });
      }

      const createdUser = user?.user;
      if (!createdUser?.id) {
        return NextResponse.json({ error: "User was created, but the account id was not returned." }, { status: 500 });
      }

      const role = requestedRole;
      const fullName = userData?.full_name || "";
      const phone = userData?.phone || "";
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: createdUser.id,
          email: normalizedEmail,
          full_name: fullName,
          phone,
          role,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

      if (profileError) {
        console.error("Create profile error:", profileError);
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }

      if (role === "BUSINESS_OWNER") {
        const businessName = (userData?.business_name || `${fullName}'s Business`).trim();
        const businessBackground = (userData?.business_background || "").trim();
        const productsSummary = (userData?.products_summary || "").trim();

        const { data: existingBusiness } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", createdUser.id)
          .limit(1)
          .maybeSingle();

        if (!existingBusiness) {
          const { error: businessError } = await supabase
            .from("businesses")
            .insert({
              owner_id: createdUser.id,
              name: businessName || "Pending Business",
              description: businessBackground,
              products_summary: productsSummary,
              status: "PENDING",
            });

          if (businessError) {
            console.error("Create business error:", businessError);
            return NextResponse.json({ error: businessError.message }, { status: 400 });
          }
        } else {
          const { error: businessUpdateError } = await supabase
            .from("businesses")
            .update({
              name: businessName || "Pending Business",
              description: businessBackground,
              products_summary: productsSummary,
            })
            .eq("id", existingBusiness.id);

          if (businessUpdateError) {
            console.error("Update business profile error:", businessUpdateError);
            return NextResponse.json({ error: businessUpdateError.message }, { status: 400 });
          }
        }
      }

      return NextResponse.json({ success: true, message: "User registered securely." });

    } else if (normalizedType === "reset") {
      // Find user ID by email using our custom RPC
      const { data: userId, error: rpcError } = await supabase.rpc("get_user_id_by_email", { lookup_email: normalizedEmail });
      
      if (rpcError || !userId) {
        console.error("Find user error:", rpcError);
        return NextResponse.json({ error: "Could not find user account." }, { status: 404 });
      }

      // Update password via admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: password
      });

      if (updateError) {
        console.error("Update password error:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: "Password updated successfully." });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  } catch (err) {
    console.error("Verify OTP API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
