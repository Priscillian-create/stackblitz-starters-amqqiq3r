import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PA GERRY POS",
  description: "Inventory, sales, customer, expense, and profit tracking for PA GERRY POS.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
