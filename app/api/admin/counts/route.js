import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const revalidate = 0;

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [{ count: verificationCount, error: verificationError }, { count: categoryCount, error: categoryError }, { count: reviewRemovalCount, error: reviewRemovalError }] = await Promise.all([
      auth.supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      auth.supabase.from("category_approval_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      auth.supabase.from("review_moderation_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    ]);

    if (verificationError || categoryError || reviewRemovalError) {
      return NextResponse.json({ error: "ADMIN_COUNTS_UNAVAILABLE" }, { status: 503 });
    }

    return NextResponse.json({
      verifications: verificationCount || 0,
      categoryApprovals: categoryCount || 0,
      reviewRemovals: reviewRemovalCount || 0,
    });
  } catch (error) {
    console.error("ADMIN_COUNTS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_COUNTS_UNAVAILABLE" }, { status: 503 });
  }
}
