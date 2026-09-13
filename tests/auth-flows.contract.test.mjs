import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("customer and business-owner signup share a validated server contract", async () => {
  const page = await source("app/signup/page.jsx");
  const route = await source("app/api/auth/signup/route.js");
  const auth = await source("lib/auth.js");
  const config = await source("supabase/config.toml");

  assert.match(page, /role === "CUSTOMER"/);
  assert.match(page, /role === "BUSINESS_OWNER"/);
  assert.match(page, /fetch\("\/api\/auth\/signup"/);
  assert.match(page, /normalizeEmail\(formData\.email\)/);
  assert.match(route, /SIGNUP_ROLES/);
  assert.match(route, /validatePassword\(password\)/);
  assert.match(route, /normalizePhilippinePhone/);
  assert.match(route, /business_background/);
  assert.match(auth, /trim\(\)\.toLowerCase\(\)/);
  assert.match(auth, /Password must include at least one uppercase letter/);
  assert.match(auth, /Password must include at least one special symbol/);
  assert.match(config, /\[auth\.email\][\s\S]*enable_confirmations = true/);
});

test("duplicate verified and unverified emails have distinct inline recovery paths", async () => {
  const route = await source("app/api/auth/signup/route.js");
  const page = await source("app/signup/page.jsx");

  assert.match(route, /EMAIL_EXISTS_VERIFIED/);
  assert.match(route, /EMAIL_EXISTS_UNVERIFIED/);
  assert.match(route, /status: 409/);
  assert.match(route, /get_auth_user_status_by_email/);
  assert.match(page, /An account with this email already exists/);
  assert.match(page, /This email is already registered but not verified/);
  assert.match(page, /href="\/login"/);
  assert.match(page, /fetch\("\/api\/auth\/resend-verification"/);
});

test("verification uses native Auth through Resend SMTP and preserves role routing", async () => {
  const signup = await source("app/api/auth/signup/route.js");
  const resend = await source("app/api/auth/resend-verification/route.js");
  const page = await source("app/signup/page.jsx");
  const confirm = await source("app/auth/confirm/page.jsx");
  const config = await source("supabase/config.toml");
  const resendHelper = await source("lib/resendEmail.js");
  const template = await source("supabase/templates/confirmation.html");

  assert.match(signup, /auth\.signUp/);
  assert.match(signup, /getAuthRedirectUrl/);
  assert.match(signup, /verificationRequired/);
  assert.match(resend, /auth\.resend/);
  assert.match(resend, /type: "signup"/);
  assert.match(resend, /getAuthRedirectUrl/);
  assert.match(resend, /consume_otp_rate_limit/);
  assert.match(config, /host = "smtp\.resend\.com"/);
  assert.match(config, /pass = "env\(RESEND_API_KEY\)"/);
  assert.match(config, /template\.confirmation/);
  assert.match(config, /templates\/confirmation\.html/);
  assert.match(template, /\{\{ \.ConfirmationURL \}\}/);
  assert.match(template, /Press &amp; Present/);
  assert.match(resendHelper, /RESEND_API_KEY/);
  assert.match(resendHelper, /User-Agent/);
  assert.match(page, /Check your inbox/);
  assert.match(page, /Resend available in/);
  assert.match(page, /disabled=\{resendLoading \|\| resendCooldown > 0\}/);
  assert.match(confirm, /exchangeCodeForSession/);
  assert.match(confirm, /verifyOtp/);
  assert.match(confirm, /getRoleHome/);
});

test("login distinguishes auth failures and never defaults an unknown profile to customer", async () => {
  const page = await source("app/login/page.jsx");
  const statusRoute = await source("app/api/auth/account-status/route.js");

  assert.match(page, /signInWithPassword/);
  assert.match(page, /Invalid email or password/);
  assert.match(page, /This email does not exist/);
  assert.match(page, /Incorrect password/);
  assert.match(page, /not verified/);
  assert.match(page, /temporarily unavailable/);
  assert.match(page, /disabled or unauthorized/);
  assert.match(page, /getRoleHome\(role\)/);
  assert.match(page, /profileError \|\| !route/);
  assert.match(page, /supabase\.auth\.signOut\(\)/);
  assert.match(statusRoute, /get_auth_user_status_by_email/);
  assert.match(statusRoute, /listUsers/);
  assert.match(statusRoute, /status: "unverified"/);
  assert.doesNotMatch(page, /role = profile\?\.role \|\| "CUSTOMER"/);
});

test("role-based login destinations and database row creation are protected", async () => {
  const auth = await source("lib/auth.js");
  const login = await source("app/login/page.jsx");
  const ownerLayout = await source("app/owner/layout.jsx");
  const migration = await source("supabase/migrations/20260912100000_auth_account_flows.sql");

  assert.match(auth, /ADMIN: "\/admin"/);
  assert.match(auth, /BUSINESS_OWNER: "\/owner\/documents"/);
  assert.match(auth, /CUSTOMER: "\/browse"/);
  assert.match(login, /router\.replace\(getSafePostLoginPath\(\) \|\| route\)/);
  assert.match(ownerLayout, /Never repair this by inserting from the browser/);
  assert.doesNotMatch(ownerLayout, /const \{ data: created \} = await supabase[\s\S]*?\.from\("businesses"\)[\s\S]*?\.insert\(/);
  assert.match(migration, /create unique index if not exists businesses_owner_id_unique_idx/);
  assert.match(migration, /create trigger trg_auth_user_create_profile/);
  assert.match(migration, /on conflict \(id\) do nothing/);
  assert.match(migration, /after insert on auth\.users/);
  assert.match(migration, /trg_profiles_auto_create_business/);
  assert.match(migration, /drop policy if exists "Owners can insert own business"/);
});

test("legacy OTP endpoints cannot create accounts or bypass email verification", async () => {
  const sendOtp = await source("app/api/auth/send-otp/route.js");
  const verifyOtp = await source("app/api/auth/verify-otp/route.js");
  const checkEmail = await source("app/api/auth/check-email/route.js");

  assert.match(sendOtp, /normalizedType !== "reset"/);
  assert.doesNotMatch(verifyOtp, /auth\.admin\.createUser/);
  assert.doesNotMatch(verifyOtp, /email_confirm: true/);
  assert.doesNotMatch(sendOtp, /console\.error\([^\n]*,\s*\w+\)/);
  assert.doesNotMatch(checkEmail, /console\.error\([^\n]*,\s*\w+\)/);
  assert.match(checkEmail, /protected[\s\S]*signup route/);
  assert.match(verifyOtp, /type !== "reset"/);
});

test("application email notifications use safe Resend delivery and configured links", async () => {
  const notify = await source("app/api/admin/notify-approved/route.js");
  const appUrl = await source("lib/appUrl.js");

  assert.match(notify, /sendResendEmail/);
  assert.match(notify, /getConfiguredAppUrl/);
  assert.match(notify, /approval was completed, but the email could not be sent/);
  assert.doesNotMatch(notify, /return NextResponse\.json\(\{ error: error\.message/);
  assert.match(appUrl, /PRODUCTION_SITE_URL/);
  assert.match(appUrl, /LOCAL_SITE_URL/);
  assert.match(appUrl, /SITE_URL/);
  assert.match(appUrl, /NEXT_PUBLIC_SITE_URL/);
  assert.match((await source("lib/resendEmail.js")), /RESEND_NOT_CONFIGURED/);
  assert.match((await source("lib/resendEmail.js")), /INVALID_EMAIL_REQUEST/);
  assert.match((await source("lib/resendEmail.js")), /RESEND_RATE_LIMITED/);
  assert.match((await source("lib/resendEmail.js")), /RESEND_NETWORK_ERROR/);
});
