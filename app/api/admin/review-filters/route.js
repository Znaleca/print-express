import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanWord(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanId(value) {
  return String(value || "").trim();
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase
      .from("review_offensive_words")
      .select("id, word, replacement, match_whole_word, is_enabled, created_at, updated_at")
      .order("word", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ words: data || [] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("ADMIN_REVIEW_FILTERS_LOAD_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_REVIEW_FILTERS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const word = cleanWord(body.word);
    if (word.length < 2 || word.length > 80) {
      return NextResponse.json({ error: "Filtered words must be between 2 and 80 characters." }, { status: 400 });
    }
    const { data, error } = await auth.supabase
      .from("review_offensive_words")
      .insert({ word, match_whole_word: body.matchWholeWord !== false, is_enabled: body.isEnabled !== false, created_by: auth.user.id, updated_by: auth.user.id })
      .select("id, word, replacement, match_whole_word, is_enabled, created_at, updated_at")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "That filtered word already exists." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ word: data }, { status: 201 });
  } catch (error) {
    console.error("ADMIN_REVIEW_FILTER_CREATE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_REVIEW_FILTER_CREATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const id = cleanId(body.id);
    const word = cleanWord(body.word);
    if (!id || word.length < 2 || word.length > 80) return NextResponse.json({ error: "A valid word is required." }, { status: 400 });
    const { data, error } = await auth.supabase
      .from("review_offensive_words")
      .update({ word, match_whole_word: body.matchWholeWord !== false, is_enabled: body.isEnabled !== false, updated_by: auth.user.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, word, replacement, match_whole_word, is_enabled, created_at, updated_at")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "That filtered word already exists." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ word: data });
  } catch (error) {
    console.error("ADMIN_REVIEW_FILTER_UPDATE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_REVIEW_FILTER_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const id = cleanId(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "A filter id is required." }, { status: 400 });
    const { error } = await auth.supabase.from("review_offensive_words").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ADMIN_REVIEW_FILTER_DELETE_ERROR:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "ADMIN_REVIEW_FILTER_DELETE_FAILED" }, { status: 500 });
  }
}
