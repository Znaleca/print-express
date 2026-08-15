"use client";

// Reuse the account settings experience inside the owner portal so it keeps
// the owner sidebar, sign-out action, and portal navigation.
import AccountSettingsPage from "@/app/account-settings/page";

export default function OwnerAccountSettingsPage() {
  return <AccountSettingsPage isOwnerPortal portalRole="owner" />;
}
