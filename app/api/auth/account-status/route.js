import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  // Keep this legacy endpoint non-disclosing for older clients that may still
  // call it. Login must not reveal whether an email belongs to an account or
  // expose its verification/disabled state.
  await request.json().catch(() => null);
  return NextResponse.json({ status: "invalid_credentials" });
}
