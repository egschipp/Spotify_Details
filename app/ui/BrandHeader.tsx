"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type BrandHeaderProps = {
  showNav?: boolean;
  navVariant?: "full" | "minimal";
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => (basePath ? `${basePath}${path}` : path);

export default function BrandHeader({
  showNav = true,
  navVariant = "full"
}: BrandHeaderProps) {
  const pathname = usePathname();
  const normalizedPath = basePath && pathname?.startsWith(basePath)
    ? pathname.replace(basePath, "") || "/"
    : pathname;
  const navItems = [
    { href: "/", label: "Home" },
    { href: "/playlists", label: "Playlists" },
    { href: "/artists", label: "Artists" },
    { href: "/credentials", label: "Credentials" }
  ];
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-[clamp(140px,20vw,250px)] w-[clamp(140px,20vw,250px)] items-center justify-center bg-transparent">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={withBasePath("/brand-logo.png")}
              alt="Spotify Details"
              className="h-full w-full object-contain"
            />
          </div>
        </div>

        {showNav && navVariant === "full" && (
          <nav className="flex flex-wrap gap-3 md:justify-end">
            {navItems.map((item) => {
              const isActive = normalizedPath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full border px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                    isActive
                      ? "border-tide/70 bg-tide/15 text-white"
                      : "border-white/15 bg-black/40 text-white hover:border-white/40"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
