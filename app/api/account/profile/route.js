import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { normalizePhilippinePhone } from "@/lib/phone";

const PROFILE_AVATARS_BUCKET = "profile-avatars";

function getOwnedAvatarPath(value, userId) {
  if (!value || !userId) return null;
  const marker = `/storage/v1/object/public/${PROFILE_AVATARS_BUCKET}/`;
  const markerIndex = String(value).indexOf(marker);
  if (markerIndex === -1) return null;

  const path = decodeURIComponent(String(value).slice(markerIndex + marker.length).split("?")[0]);
  return path.startsWith(`${userId}/avatars/`) ? path : null;
}

export async function PATCH(request) {
  const supabase = getSupabaseAdminClient();

  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { fullName, phone, avatarPath, removeAvatar = false } = await request.json();

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
      .select("role, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    const preservedRole = ["CUSTOMER", "BUSINESS_OWNER", "ADMIN"].includes(currentProfile?.role)
      ? currentProfile.role
      : "CUSTOMER";

    let nextAvatarUrl = currentProfile?.avatar_url || user.user_metadata?.avatar_url || null;
    let normalizedAvatarPath = null;

    if (removeAvatar === true) {
      nextAvatarUrl = null;
    } else if (avatarPath) {
      normalizedAvatarPath = String(avatarPath).replace(/^\/+/, "");
      const allowedPath = new RegExp(`^${user.id}/avatars/avatar-[0-9]+\\.(?:jpe?g|png|webp)$`, "i");
      if (!allowedPath.test(normalizedAvatarPath)) {
        return NextResponse.json({ error: "Invalid profile photo path." }, { status: 400 });
      }

      const pathParts = normalizedAvatarPath.split("/");
      const fileName = pathParts.pop();
      const folder = pathParts.join("/");
      const { data: storedFiles, error: storageError } = await supabase.storage
        .from(PROFILE_AVATARS_BUCKET)
        .list(folder, { limit: 10, search: fileName });

      if (storageError || !storedFiles?.some((file) => file.name === fileName)) {
        return NextResponse.json({ error: "The uploaded profile photo could not be verified." }, { status: 400 });
      }

      const { data: publicUrlData } = supabase.storage
        .from(PROFILE_AVATARS_BUCKET)
        .getPublicUrl(normalizedAvatarPath);
      nextAvatarUrl = publicUrlData?.publicUrl || null;
    }

    const nextMetadata = {
      ...(user.user_metadata || {}),
      full_name: cleanName,
      phone: normalizedPhone,
      role: preservedRole,
      avatar_url: nextAvatarUrl,
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
        avatar_url: nextAvatarUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (profileError) throw profileError;

    const previousAvatarPath = getOwnedAvatarPath(currentProfile?.avatar_url, user.id);
    if ((normalizedAvatarPath || removeAvatar === true) && previousAvatarPath && previousAvatarPath !== normalizedAvatarPath) {
      const { error: cleanupError } = await supabase.storage
        .from(PROFILE_AVATARS_BUCKET)
        .remove([previousAvatarPath]);
      if (cleanupError) {
        console.warn("[Profile] Could not remove the previous avatar:", cleanupError.message);
      }
    }

    return NextResponse.json({
      success: true,
      profile: { full_name: cleanName, phone: normalizedPhone, email: user.email, avatar_url: nextAvatarUrl },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update profile" }, { status: 500 });
  }
}
