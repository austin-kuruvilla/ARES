import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "ARES — Cyber Decision Engine",
    description: "Investigate cyber alerts, compare response options, and approve an auditable next action.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "ARES — Cyber Decision Engine",
      description: "Turn security evidence into a defensible, human-approved response.",
      type: "website",
      images: [{ url: `${origin}/og-ares-decision-brief.png`, width: 1536, height: 1024, alt: "ARES Cyber Decision Engine incident-to-containment decision brief" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ARES — Cyber Decision Engine",
      description: "Turn security evidence into a defensible, human-approved response.",
      images: [`${origin}/og-ares-decision-brief.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
