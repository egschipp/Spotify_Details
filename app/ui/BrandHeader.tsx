import Link from "next/link";

type BrandHeaderProps = {
  title?: string;
  subtitle?: string;
  showNav?: boolean;
  navVariant?: "full" | "minimal";
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => (basePath ? `${basePath}${path}` : path);

export default function BrandHeader({
  title,
  subtitle,
  showNav = true,
  navVariant = "full"
}: BrandHeaderProps) {
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-[250px] w-[250px] items-center justify-center bg-transparent">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={withBasePath("/brand-logo.png")}
              alt="Spotify Details"
              className="h-[250px] w-[250px] object-contain"
            />
          </div>
          <div className="space-y-1">
            {subtitle && (
              <p className="text-sm text-white/60 md:text-base">{subtitle}</p>
            )}
          </div>
        </div>

        {showNav && navVariant === "full" && (
          <nav className="flex flex-wrap gap-3 md:justify-end">
            <Link
              href="/"
              className="rounded-full border border-white/15 bg-black/40 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              Home
            </Link>
            <Link
              href="/playlists"
              className="rounded-full border border-white/15 bg-black/40 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              Playlists
            </Link>
            <Link
              href="/credentials"
              className="rounded-full border border-white/15 bg-black/40 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              Credentials
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
