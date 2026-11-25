import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://trace-opal-gamma.vercel.app"
  ),
  title: "TRACE — Look Beyond the File",
  description:
    "Universal File Intelligence & Digital Forensics Workspace. Inspect hidden metadata, verify binary signatures, trace raw byte offsets, and strip sensitive tags locally in your browser.",
  openGraph: {
    title: "TRACE — Look Beyond the File",
    description:
      "Inspect true binary signatures, embedded metadata, multi-layer timestamps, and raw byte offsets locally in your browser.",
    type: "website",
    siteName: "TRACE File Intelligence",
  },
  twitter: {
    card: "summary_large_image",
    title: "TRACE — Look Beyond the File",
    description:
      "Local-first forensic metadata inspector, virtualized Hex Editor, RE Mode telemetry, and lossless metadata sanitizer.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased selection:bg-[var(--accent-soft)] selection:text-[var(--text-primary)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-[var(--cta-bg)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--cta-text)]"
        >
          Skip to main content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
