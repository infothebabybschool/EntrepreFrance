import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { PostHogProvider } from "@/components/PostHogProvider";
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
    default: "BEpaper — L'actualité belge en français",
    template: "%s | BEpaper",
  },
  description:
    "BEpaper couvre l'actualité belge en français : politique, société, culture, économie et Europe.",
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
