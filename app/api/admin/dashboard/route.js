import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const revalidate = 0;

/**
 * INIT_ADMIN_PROTOCOL
 * Authenticates via the Bearer token to interface with public.profiles
 */
const getAdminClient = (request) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!token) {
    throw new Error("Missing bearer token.");
  }

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
};

/**
 * GET: SYSTEM_CORE_SNAPSHOT
 * Fetches the master registry of profiles and businesses
 */
export async function GET(request) {
  try {
    const supabase = getAdminClient(request);

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
    const { businessId, ownerId, action } = await request.json();
    if (!businessId || !ownerId || !action) {
      return NextResponse.json({ error: "PAYLOAD_INCOMPLETE" }, { status: 400 });
    }

    const supabase = getAdminClient(request);
    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    // 1. UPDATE BUSINESS STATUS
    const { error: bizError } = await supabase
      .from("businesses")
      .update({ status: newStatus })
      .eq("id", businessId);
    if (bizError) throw bizError;

    // 2. ROLE ELEVATION: Update public.profiles (linked to auth.users)
    // Only happens on APPROVE to change role from 'CUSTOMER' to 'BUSINESS_OWNER'
    if (action === "APPROVE") {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ 
          role: "BUSINESS_OWNER",
          updated_at: new Date().toISOString() 
        })
        .eq("id", ownerId);
      
      if (profileError) throw profileError;
    }

    return NextResponse.json({ 
      success: true, 
      status_applied: newStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("REGISTRY_WRITE_ERROR:", error);
    return NextResponse.json({ error: "TRANSACTION_REJECTED", details: error.message }, { status: 500 });
  }
}