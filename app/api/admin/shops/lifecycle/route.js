import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const businessId = String(body?.businessId || "").trim();
    const action = String(body?.action || "").trim().toUpperCase();
    const reason = String(body?.reason || "").trim().slice(0, 500);

    if (!businessId || !["LOCK", "UNLOCK", "ARCHIVE"].includes(action)) {
      return NextResponse.json({ error: "Invalid lifecycle request." }, { status: 400 });
    }

    const { data, error } = await auth.supabase.rpc("admin_set_shop_lifecycle", {
      p_business_id: businessId,
      p_action: action,
      p_reason: reason || null,
      p_requester_id: auth.user.id,
    });

    if (error) throw error;
    return NextResponse.json({ success: true, result: data });
  } catch (error) {
    console.error("ADMIN_SHOP_LIFECYCLE_ERROR:", error);
    return NextResponse.json(
      { error: "Unable to update shop lifecycle.", details: error.message },
      { status: 500 }
    );
  }
}
