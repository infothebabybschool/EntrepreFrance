import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { PostHogProvider } from "@/components/PostHogProvider";
import { SITE_NAME, TAGLINE, ARTICLE_LANGUAGE, IS_RTL, FAVICON_URL } from "@/lib/brand";
import "./globals.css";

const serifFont = Cormorant_Garamond({
  subsets: ["latin","latin-ext"],
  variable: "--font-serif",
  display: "swap",
});

const sansFont = Jost({
  subsets: ["latin","latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: `${SITE_NAME} — ${TAGLINE}`,
  ...(FAVICON_URL ? { icons: { icon: FAVICON_URL } } : {}),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  return (
    <ClerkProvider>
      <html lang={ARTICLE_LANGUAGE} dir={IS_RTL ? "rtl" : "ltr"}>
        <head>
          <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
        </head>
        <body className={`${serifFont.variable} ${sansFont.variable} font-sans bg-gray-50 antialiased`}>
          {posthogKey ? (
            <PostHogProvider>
              <Header />
              <main className="min-h-screen">{children}</main>
              <Footer />
            </PostHogProvider>
          ) : (
            <>
              <Header />
              <main className="min-h-screen">{children}</main>
              <Footer />
            </>
          )}
        </body>
      </html>
    </ClerkProvider>
  );
}
