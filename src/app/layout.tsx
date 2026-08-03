import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kambio — the AI operating system for exporters",
  description:
    "Kambio turns buyer emails and WhatsApp messages into a structured shipment workspace, with AI that drafts and humans that confirm.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
