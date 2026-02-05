import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GasPass - Multi-Chain Gas Tracker",
  description:
    "Real-time gas prices across Ethereum, Solana, Polygon, Arbitrum, Optimism, Base, BNB Chain, Avalanche, and more",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
