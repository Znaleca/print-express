import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LiveChatWidget from "@/components/LiveChatWidget";
import "@/assets/styles/globals.css";

export const metadata = {
  title: "Press & Present | Find. Print. Deliver.",
  description: "Your go-to platform for discovering printing shops and managing print jobs online.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <LiveChatWidget />
      </body>
    </html>
  );
}
