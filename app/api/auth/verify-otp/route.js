import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const supabase = getSupabaseAdminClient();

    const { email, code, type, password, userData } = await request.json();

    if (!email || !code || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Verify OTP in database
    const { data: verifications, error: verifyError } = await supabase
      .from("otp_verifications")
      .select("*")
      .eq("email", email)
      .eq("type", type)
      .eq("otp_code", code)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (verifyError || !verifications || verifications.length === 0) {
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
    }

    // 2. Delete the used code
    await supabase.from("otp_verifications").delete().eq("id", verifications[0].id);

    // 3. Process Based on Type
    if (type === "signup") {
      if (!password) return NextResponse.json({ error: "Password required for signup" }, { status: 400 });
      
      // Auto-confirm the user during creation since they already verified the code
      const { data: user, error: createUserError } = await supabase.auth.admin.createUser({
        email: email,
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

      const role = userData?.role || "CUSTOMER";
      const fullName = userData?.full_name || "";
      const phone = userData?.phone || "";
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: createdUser.id,
          email,
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
              status: "PENDING",
            });

          if (businessError) {
            console.error("Create business error:", businessError);
            return NextResponse.json({ error: businessError.message }, { status: 400 });
          }
        }
      }

      return NextResponse.json({ success: true, message: "User registered securely." });

    } else if (type === "reset") {
      if (!password) return NextResponse.json({ error: "New password required for reset" }, { status: 400 });

      // Find user ID by email using our custom RPC
      const { data: userId, error: rpcError } = await supabase.rpc("get_user_id_by_email", { lookup_email: email });
      
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
