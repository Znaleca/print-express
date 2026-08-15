import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { normalizePhilippinePhone } from "@/lib/phone";

export async function PATCH(request) {
  const supabase = getSupabaseAdminClient();

  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { fullName, phone } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalizedPhone = normalizePhilippinePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Enter a valid Philippine mobile number." }, { status: 400 });
    }

    const cleanName = String(fullName || "").trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      return NextResponse.json({ error: "Name must be between 2 and 120 characters." }, { status: 400 });
    }

    // Never allow a client-provided user_metadata.role to overwrite the
    // database role. The profile table is the source of truth for access.
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const metadataRole = user.user_metadata?.role;
    const preservedRole = ["CUSTOMER", "BUSINESS_OWNER", "ADMIN"].includes(currentProfile?.role)
      ? currentProfile.role
      : (["CUSTOMER", "BUSINESS_OWNER"].includes(metadataRole) ? metadataRole : "CUSTOMER");

    const nextMetadata = {
      ...(user.user_metadata || {}),
      full_name: cleanName,
      phone: normalizedPhone,
      role: preservedRole,
    };

    const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: nextMetadata,
    });
    if (authError) throw authError;

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        full_name: cleanName,
        phone: normalizedPhone,
        role: preservedRole,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      profile: { full_name: cleanName, phone: normalizedPhone, email: user.email },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
  }
}
