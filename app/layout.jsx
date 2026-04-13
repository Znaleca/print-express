import { Inter, Outfit } from "next/font/google";
import Navbar from "@/components/Navbar";
import LiveChatWidget from "@/components/LiveChatWidget";
import "@/assets/styles/globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata = {
  title: "Print Express | Premium Directory & Marketplace",
  description: "Find the best printing businesses, get instant quotes, and manage your orders online.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} data-scroll-behavior="smooth">
      <body>
        <Navbar />
        {children}
        <LiveChatWidget />
      </body>
    </html>
  );
}
