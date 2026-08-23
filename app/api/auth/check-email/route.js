import { NextResponse } from "next/server";

export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    // Account existence is intentionally not checked here. A public
    // availability endpoint is an account-enumeration oracle; signup handles
    // duplicate addresses through the generic OTP flow instead.
    return NextResponse.json({ exists: false, checkUnavailable: true });
  } catch (err) {
    console.error("Check email API error:", err);

    return NextResponse.json(
      {
        exists: false,
        checkUnavailable: true,
        message: "Email availability check is temporarily unavailable.",
      },
      { status: 200 }
    );
  }
}
