import type { Metadata, Viewport } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { AuthUIProvider } from "@/lib/auth/provider-components";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Space Grotesk on headings only. On an H1 with tight tracking it is doing most of
// the work of not looking like a bootstrap app.
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Lightweight property CRM for lead, contact, property, and deal management.",
};

// Mobile-first: agents work from phones in the field.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">
        <AuthUIProvider>{children}</AuthUIProvider>
      </body>
    </html>
  );
}
