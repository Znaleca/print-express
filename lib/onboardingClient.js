import { supabase } from "@/lib/supabaseClient";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    throw new Error("Your session expired. Please sign in again.");
  }
  return data.session.access_token;
}

export async function onboardingRequest(method, body = null, version = "v1") {
  const token = await getAccessToken();
  const url = `/api/onboarding${method === "GET" ? `?version=${encodeURIComponent(version)}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify({ ...body, tutorialVersion: version }) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Unable to update onboarding progress.");
  }
  return payload;
}

