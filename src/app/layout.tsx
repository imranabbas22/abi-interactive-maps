import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-rajdhani",
});

export const metadata: Metadata = {
  title: "ABI Interactive Maps - Arena Breakout Infinite",
  description: "Interactive maps for Arena Breakout Infinite - spawn points, loot containers, safes, extracts, and more",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${rajdhani.variable}`}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
