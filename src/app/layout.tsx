import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextWave MultiSender | Messaging Operations",
  description: "A unified workspace for sender accounts, campaigns, contacts and messaging operations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
