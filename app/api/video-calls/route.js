import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const getBearerToken = (request) => {
  const value = request.headers.get("authorization") || "";
  return value.replace(/^Bearer\s+/i, "").trim();
};

function getUserScopedClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
}

const RPC_BY_ACTION = {
  request: { name: "video_call_request", args: (body) => ({ p_conversation_id: body.conversationId }) },
  schedule: { name: "video_call_schedule", args: (body) => ({ p_call_id: body.callId, p_scheduled_at: body.scheduledAt }) },
  join: { name: "video_call_join", args: (body) => ({ p_call_id: body.callId }) },
  cancel: { name: "video_call_cancel", args: (body) => ({ p_call_id: body.callId, p_reason: body.reason || null }) },
  end: { name: "video_call_end", args: (body) => ({ p_call_id: body.callId }) },
};

export async function POST(request) {
  try {
    const token = getBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: userData, error: authError } = await admin.auth.getUser(token);
    if (authError || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const action = String(body?.action || "").trim().toLowerCase();
    const rpc = RPC_BY_ACTION[action];
    if (!rpc) return NextResponse.json({ error: "Unsupported video call action." }, { status: 400 });

    if (["request", "schedule", "join", "cancel", "end"].includes(action) && !body.callId && action !== "request") {
      return NextResponse.json({ error: "A video call ID is required." }, { status: 400 });
    }
    const userClient = getUserScopedClient(token);
    const { data, error } = await userClient.rpc(rpc.name, rpc.args(body));
    if (error) {
      const status = /only|not|expired|available|choose|scheduled|participant|authorized|invalid/i.test(error.message) ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const call = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ success: true, call: call || null });
  } catch (error) {
    console.error("VIDEO_CALL_API_ERROR:", error);
    return NextResponse.json({ error: "Unable to process the video call request." }, { status: 500 });
  }
}
