import type { Metadata } from "next";
import { Roboto, Anton, Luckiest_Guy, Montserrat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { LOCAL_AUTH } from "@/lib/auth";
import "./globals.css";

const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"] });
// Caption-style preview fonts — must match the fonts baked into worker/captions/*.html
const anton      = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const luckiest   = Luckiest_Guy({ subsets: ["latin"], weight: "400", variable: "--font-luckiest" });
const montserrat = Montserrat({ subsets: ["latin"], weight: "800", variable: "--font-montserrat" });

export const metadata: Metadata = {
  title: "Clippy — AI Video Repurposing",
  description: "Transform long-form video into high-converting short clips with AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const html = (
    <html lang="en">
      <body className={`${roboto.className} ${anton.variable} ${luckiest.variable} ${montserrat.variable} bg-[var(--yt-bg)] text-[var(--yt-text)] antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );

  // ClerkProvider requires a publishable key — local installs render without it.
  return LOCAL_AUTH ? html : <ClerkProvider>{html}</ClerkProvider>;
}
