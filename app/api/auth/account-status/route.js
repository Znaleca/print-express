import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { isValidEmail, normalizeEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

const USERS_PER_PAGE = 1000;

async function findAccountWithAdminApi(admin, email) {
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) return { account: null, error };

    const users = Array.isArray(data?.users) ? data.users : [];
    const account = users.find((user) => normalizeEmail(user?.email) === email) || null;
    if (account) return { account, error: null };

    const nextPage = Number(data?.nextPage);
    if (Number.isInteger(nextPage) && nextPage > page) {
      page = nextPage;
      continue;
    }

    if (users.length < USERS_PER_PAGE || (data?.lastPage && page >= data.lastPage)) {
      return { account: null, error: null };
    }

    page += 1;
  }
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
    }

    const email = normalizeEmail(body?.email);
    if (!isValidEmail(email)) {
      return NextResponse.json({ status: "not_found" });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("get_auth_user_status_by_email", {
      lookup_email: email,
    });

    let account = Array.isArray(data) ? data[0] || null : data || null;
    if (error) {
      // Keep the database function as the fast path. The admin API fallback
      // keeps login messaging useful while a newly added migration is being
      // deployed, and remains server-only because this route uses the
      // service-role client.
      const fallback = await findAccountWithAdminApi(admin, email);
      if (fallback.error) {
        console.error("AUTH_ACCOUNT_STATUS_LOOKUP_FAILED");
        return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
      }
      account = fallback.account;
    }

    if (!account) return NextResponse.json({ status: "not_found" });
    if (account.banned_until || account.deleted_at) return NextResponse.json({ status: "disabled" });
    if (!account.email_confirmed_at) return NextResponse.json({ status: "unverified" });
    return NextResponse.json({ status: "active" });
  } catch {
    console.error("AUTH_ACCOUNT_STATUS_UNAVAILABLE");
    return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
}
