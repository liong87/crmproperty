import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";
import { AuthUIProvider } from "@/lib/auth/provider-components";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Fraunces on headings only. The serif is the most distinctive thing about this app
// and the competitor teardown was explicit that it stays.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Lightweight property CRM for lead, contact, property, and deal management.",
};

// Mobile-first: agents work from phones in the field.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /*
   * NO maximumScale. It was set to 1, which disables pinch-to-zoom app-wide — two
   * lines below a comment about agents working from phones.
   *
   * That is a WCAG 1.4.4 failure, but the practical harm is plainer: this app shows
   * price lists, unit numbers and scanned SPAs on a six-inch screen, and an agent
   * standing in a sales gallery could not zoom in on any of them. Nobody would report
   * that as a bug; they would squint, then use WhatsApp instead.
   */
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
