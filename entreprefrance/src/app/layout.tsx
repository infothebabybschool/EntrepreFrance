import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { PostHogProvider } from "@/components/PostHogProvider";
import { SITE_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: `${SITE_NAME} — ${TAGLINE}`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="fr">
        <body className={`${playfair.variable} ${inter.variable} font-sans bg-gray-50 antialiased`}>
          <PostHogProvider>
            <Header />
            <main className="min-h-screen">{children}</main>
            <Footer />
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
