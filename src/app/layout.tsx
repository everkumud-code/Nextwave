import type { Metadata } from "next";
import "./globals.css";
import { LogoSplash } from "@/components/logo-splash";

export const metadata: Metadata = {
  title: "NextWave | Bulk WhatsApp messaging",
  description: "NextWave, a Next Resource company: import contacts, send WhatsApp campaigns with pictures, video, audio and PDF, and download delivery and read reports.",
  applicationName: "NextWave",
  icons: { icon: [{ url: "/icon.png", type: "image/png" }], apple: "/apple-icon.png" },
  openGraph: {
    title: "NextWave | Bulk WhatsApp messaging",
    description: "A Next Resource company.",
    siteName: "NextWave",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "NextWave, a Next Resource company" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LogoSplash />
        {children}
      </body>
    </html>
  );
}
