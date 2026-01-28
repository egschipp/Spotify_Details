import Link from "next/link";

type BrandHeaderProps = {
  title?: string;
  subtitle?: string;
  showNav?: boolean;
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => (basePath ? `${basePath}${path}` : path);

export default function BrandHeader({
  title,
  subtitle,
  showNav = true
}: BrandHeaderProps) {
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/60 ring-1 ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={withBasePath("/brand-logo.png")}
              alt="Spotify Details"
              className="h-12 w-12 object-contain"
            />
          </div>
          <div className="space-y-1">
            {title && (
              <h1 className="font-display text-2xl font-semibold md:text-3xl">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm text-white/60 md:text-base">{subtitle}</p>
            )}
          </div>
        </div>

        {showNav && (
          <nav className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full border border-white/15 bg-black/40 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              Overzicht
            </Link>
            <Link
              href="/playlists"
              className="rounded-full border border-white/15 bg-black/40 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              Playlists
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
