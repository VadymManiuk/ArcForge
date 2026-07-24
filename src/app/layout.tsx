import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/header";
import { NetworkBanner } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "ArcOrigin — Launch and discover tokens on Arc", template: "%s · ArcOrigin" },
  description: "USDC bonding curves, transparent fees, verified creator history, real-time charts, and risk labels for Arc-native tokens.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en"><body className="antialiased">
      <Providers><NetworkBanner /><Header /><main>{children}</main></Providers>
    </body></html>
  );
}
