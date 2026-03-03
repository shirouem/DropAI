import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DropAI - Content Farm",
  description: "Organic dropshipping content generation utility",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased h-screen overflow-hidden flex selection:bg-white selection:text-black`}
      >
        <div className="fixed inset-0 z-0 pointer-events-none grid-bg opacity-40"></div>
        {children}
      </body>
    </html>
  );
}
