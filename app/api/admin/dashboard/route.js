import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const revalidate = 0;

/**
 * GET: SYSTEM_CORE_SNAPSHOT
 * Fetches the master registry of profiles and businesses
 */
export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase } = auth;

    const { data: snapshot, error: snapshotError } = await supabase.rpc("admin_dashboard_snapshot");

    if (snapshotError) {
      const message = (snapshotError.message || "").toLowerCase();
      const isMissingFunction = message.includes("admin_dashboard_snapshot") && message.includes("does not exist");

      if (isMissingFunction) {
        return NextResponse.json(
          {
            error: "ADMIN_DASHBOARD_RPC_MISSING",
            details: "Run supabase/admin-dashboard-rpc.sql in Supabase SQL Editor to enable full account visibility in admin dashboard.",
          },
          { status: 500 }
        );
      }

      throw snapshotError;
    }

    return NextResponse.json(snapshot || {
      users: [],
      totalBusinesses: 0,
      ownerProfiles: [],
      ownerBusinesses: [],
    });

  } catch (error) {
    console.error("DATA_SYNC_CRITICAL_FAILURE:", error);
    return NextResponse.json({ error: "INTERNAL_TRANSACTION_ERROR", details: error.message }, { status: 500 });
  }
}

/**
 * PATCH: REGISTRY_UPDATE_PROTOCOL
 * Updates business status and elevates the associated public.profile role
 */
export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { businessId, action } = await request.json();
    if (!businessId || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "PAYLOAD_INCOMPLETE" }, { status: 400 });
    }

    const { supabase } = auth;
    const { data: result, error } = await supabase.rpc("admin_set_business_status", {
      p_business_id: businessId,
      p_action: action,
      p_requester_id: auth.user.id,
    });
    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      status_applied: result?.status,
      owner_id: result?.owner_id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("REGISTRY_WRITE_ERROR:", error);
    return NextResponse.json({ error: "TRANSACTION_REJECTED", details: error.message }, { status: 500 });
  }
}
