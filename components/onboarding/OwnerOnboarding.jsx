"use client";

import OnboardingProvider from "@/components/onboarding/OnboardingProvider";

const VERIFICATION_STEPS = [
  {
    id: "verification-welcome",
    eyebrow: "OWNER SETUP",
    title: "Let’s get your shop ready for review.",
    description: "Before customers can discover your shop, complete the verification checklist. This tour explains what is required and where to see each real document status.",
    target: '[data-tour="owner-documents"]',
  },
  {
    id: "verification-profile",
    eyebrow: "1 / SHOP DETAILS",
    title: "Review your business information.",
    description: "Your business background and products or services are shown here for review. These details stay read-only until an admin approves a change request.",
    target: '[data-tour="owner-documents-profile"]',
  },
  {
    id: "verification-documents",
    eyebrow: "2 / REQUIRED FILES",
    title: "Submit clear verification documents.",
    description: "Upload the required DTI, Mayor’s Permit, BIR, and valid ID files. Each document shows its actual review status and any admin note.",
    target: '[data-tour="owner-documents-list"]',
  },
  {
    id: "verification-status",
    eyebrow: "3 / REVIEW STATUS",
    title: "Follow the admin review.",
    description: "Once every required document is approved, your owner workspace unlocks automatically. Rejected documents explain what needs to be replaced.",
    target: '[data-tour="owner-documents-status"]',
  },
];

const OWNER_STEPS = [
  {
    id: "owner-dashboard",
    eyebrow: "OWNER WORKSPACE",
    title: "Run your print shop from one workspace.",
    description: "The overview uses your real shop orders, catalog, revenue, and attention items so you can see what needs action first.",
    target: '[data-tour="owner-dashboard"]',
  },
  {
    id: "owner-shop-profile",
    eyebrow: "1 / STOREFRONT",
    title: "Keep your shop profile accurate.",
    description: "Update your customer-facing details, logo, payment instructions, location, and operating hours from My Shop.",
    target: '[data-tour="owner-shop-profile"]',
  },
  {
    id: "owner-shop-status",
    eyebrow: "2 / AVAILABILITY",
    title: "Control when customers can order.",
    description: "Your schedule controls regular opening hours. You can also manually close or reopen the storefront when needed.",
    target: '[data-tour="owner-shop-status"]',
  },
  {
    id: "owner-documents",
    eyebrow: "3 / VERIFICATION",
    title: "Keep your verification history organized.",
    description: "View submitted documents, review status, and admin notes. Your account and historical records remain preserved throughout review.",
    target: '[data-tour="owner-documents"]',
  },
  {
    id: "owner-catalog",
    eyebrow: "4 / CATALOG",
    title: "Build products and custom services.",
    description: "Add ready-made products with stock or made-to-order services with customer-facing options and price modifiers.",
    target: '[data-tour="owner-catalog"]',
  },
  {
    id: "owner-orders",
    eyebrow: "5 / ORDERS",
    title: "Move each order through production.",
    description: "Review customer details, update the current status, preserve status history, and handle cancellations or refunds from one place.",
    target: '[data-tour="owner-orders"]',
  },
  {
    id: "owner-messages",
    eyebrow: "6 / COMMUNICATION",
    title: "Reply, quote, and proof work with customers.",
    description: "Keep conversations, uploaded files, quotations, design proofs, and video consultations together in the shop inbox.",
    target: '[data-tour="owner-messages"]',
  },
  {
    id: "owner-reviews",
    eyebrow: "7 / REPUTATION",
    title: "Learn from customer feedback.",
    description: "Review published and hidden feedback and manage which customer reviews appear on your public profile.",
    target: '[data-tour="owner-reviews"]',
  },
  {
    id: "owner-account-settings",
    eyebrow: "8 / ACCOUNT",
    title: "Keep your owner account secure.",
    description: "Update your profile, avatar, phone number, and password. Tutorial progress can also be restarted from account settings.",
    target: '[data-tour="owner-account-settings"]',
  },
];

export default function OwnerOnboarding({ mode = "approved", children }) {
  const isVerification = mode === "verification";
  const steps = isVerification ? VERIFICATION_STEPS : OWNER_STEPS;

  return (
    <OnboardingProvider
      role="BUSINESS_OWNER"
      steps={steps}
      tutorialVersion={isVerification ? "owner-verification-v1" : "owner-v1"}
    >
      {children}
    </OnboardingProvider>
  );
}

