import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Georgies Spotify Meta Data",
  description: "Inspect playlist metadata with private Spotify access."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${spaceGrotesk.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
