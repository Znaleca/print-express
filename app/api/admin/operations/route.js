import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";
import { buildAdminOperationsFallback } from "@/lib/adminOperationsFallback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_RANGES = new Map([
  ["7", 7],
  ["30", 30],
  ["90", 90],
  ["all", null],
]);

function isOperationsRpcUnavailable(error) {
  const message = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  return message.includes("admin_operations_snapshot") && (
    message.includes("does not exist")
    || message.includes("schema cache")
    || message.includes("could not find the function")
    || message.includes("not found")
  );
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const requestedRange = new URL(request.url).searchParams.get("range") || "30";
    if (!VALID_RANGES.has(requestedRange)) {
      return NextResponse.json({ error: "INVALID_DASHBOARD_RANGE" }, { status: 400 });
    }

    const { data, error } = await auth.supabase.rpc("admin_operations_snapshot", {
      p_requester_id: auth.user.id,
      p_range_days: VALID_RANGES.get(requestedRange),
    });

    if (error) {
      try {
        const fallback = await buildAdminOperationsFallback({
          supabase: auth.supabase,
          rangeDays: VALID_RANGES.get(requestedRange),
        });
        return NextResponse.json({ ...fallback, range: requestedRange });
      } catch (fallbackError) {
        if (isOperationsRpcUnavailable(error) || isOperationsRpcUnavailable(fallbackError)) {
          return NextResponse.json(
            {
              error: "ADMIN_OPERATIONS_RPC_MISSING",
              details: "Apply supabase/migrations/20260912110000_admin_operations_dashboard.sql before opening the Admin dashboard.",
            },
            { status: 503 },
          );
        }
        throw fallbackError;
      }
    }

    return NextResponse.json({ ...data, range: requestedRange });
  } catch (error) {
    console.error("ADMIN_OPERATIONS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_OPERATIONS_UNAVAILABLE" }, { status: 503 });
  }
}
