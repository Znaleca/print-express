import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LiveChatWidget from "@/components/LiveChatWidget";
import CustomerOnboarding from "@/components/onboarding/CustomerOnboarding";
import "@/assets/styles/globals.css";

export const metadata = {
  title: "Press & Present | Find. Print. Deliver.",
  description: "Your go-to platform for discovering printing shops and managing print jobs online.",
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
