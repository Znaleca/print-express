import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LiveChatWidget from "@/components/LiveChatWidget";
import CustomerOnboarding from "@/components/onboarding/CustomerOnboarding";
import "@/assets/styles/globals.css";
import { getAppUrl, getConfiguredAppUrl } from "@/lib/appUrl";

const siteUrl = getConfiguredAppUrl();

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "Press & Present | Find. Print. Deliver.",
  description: "Your go-to platform for discovering printing shops and managing print jobs online.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: getAppUrl("/"),
    siteName: "Press & Present",
    title: "Press & Present | Find. Print. Deliver.",
    description: "Discover printing shops and manage print jobs online.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen flex flex-col app-body">
        <Navbar />
        <div className="flex-1 app-route-shell">
          <CustomerOnboarding>{children}</CustomerOnboarding>
        </div>
        <Footer />
        <LiveChatWidget />
      </body>
    </html>
  );
}
