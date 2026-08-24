"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import OnboardingProvider from "@/components/onboarding/OnboardingProvider";

export const CUSTOMER_ONBOARDING_STEPS = [
  {
    id: "welcome",
    eyebrow: "YOUR PRINTING STARTS HERE",
    title: "Find the right print partner.",
    description: "This short tour shows you how to compare verified shops, customize services, checkout securely, and track every order.",
  },
  {
    id: "browse-search",
    eyebrow: "1 / DISCOVER",
    title: "Search shops, services, or areas.",
    description: "Start with a shop name, the print service you need, or an area. Suggestions update from verified shops available to customers.",
    target: '[data-tour="browse-search"]',
  },
  {
    id: "browse-map",
    eyebrow: "2 / FIND NEARBY",
    title: "Use the map to compare locations.",
    description: "Shop pins show verified partners. You can use your location when you want nearby results, then select a shop to focus its pin.",
    target: '[data-tour="browse-map"]',
  },
  {
    id: "shop-directory",
    eyebrow: "3 / COMPARE",
    title: "Compare shops at a glance.",
    description: "Review each shop’s location, opening status, rating, services, and real catalog before choosing where to order.",
    target: '[data-tour="shop-directory"]',
  },
  {
    id: "catalog-items",
    eyebrow: "4 / CHOOSE",
    title: "Browse the shop catalog.",
    description: "Ready-made products can be purchased directly. Made-to-order services are designed around your requirements and may need a shop quotation.",
    target: '[data-tour="catalog-items"]',
  },
  {
    id: "service-customizer",
    eyebrow: "5 / CUSTOMIZE",
    title: "Add the details your print needs.",
    description: "For custom services, choose the available size, material, quality, quantity, notes, and design files before sending your request.",
    target: '[data-tour="custom-service"]',
  },
  {
    id: "cart-summary",
    eyebrow: "6 / REVIEW",
    title: "Review your cart before checkout.",
    description: "The cart separates ready-made products from accepted service quotes so you can confirm quantities, specifications, notes, and totals.",
    target: '[data-tour="cart-summary"]',
  },
  {
    id: "checkout-summary",
    eyebrow: "7 / CHECK OUT",
    title: "Confirm fulfillment and payment.",
    description: "Choose pickup or delivery, confirm your contact details, review the final order summary, and submit payment information securely.",
    target: '[data-tour="checkout-summary"]',
  },
  {
    id: "shop-messages",
    eyebrow: "8 / TALK TO THE SHOP",
    title: "Ask questions in one conversation.",
    description: "Message the shop about requirements, upload design files, review proofs, receive quotations, and request a video consultation when available.",
    target: '[data-tour="shop-messages"]',
  },
  {
    id: "track-orders",
    eyebrow: "9 / STAY UPDATED",
    title: "Track your order from start to finish.",
    description: "Follow status changes, view your order documents, request help, and leave a review after the shop completes your order.",
    target: '[data-tour="track-orders"]',
  },
];

const CUSTOMER_ROUTE_EXCLUSIONS = [
  "/login",
  "/signup",
  "/reset-password",
  "/auth",
  "/owner",
  "/admin",
];

function isExcludedRoute(pathname) {
  return CUSTOMER_ROUTE_EXCLUSIONS.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export default function CustomerOnboarding({ children }) {
  const pathname = usePathname();
  const [role, setRole] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setRole(null);
        setAuthReady(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setRole(profile?.role || null);
        setAuthReady(true);
      }
    };

    loadRole();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(loadRole, 0);
    });

    return () => {
      cancelled = true;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const shouldMount = useMemo(
    () => authReady && role === "CUSTOMER" && !isExcludedRoute(pathname || "/"),
    [authReady, pathname, role]
  );

  if (!shouldMount) return children;

  return (
    <OnboardingProvider
      role={role}
      steps={CUSTOMER_ONBOARDING_STEPS}
      tutorialVersion="v2"
      autoStart={pathname === "/"}
    >
      {children}
    </OnboardingProvider>
  );
}
