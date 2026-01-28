"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandHeader from "@/app/ui/BrandHeader";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => (basePath ? `${basePath}${path}` : path);

export default function CredentialsPage() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [credStatus, setCredStatus] = useState<{
    hasCredentials: boolean;
    clientId?: string;
  }>({ hasCredentials: false });
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean }>({
    authenticated: false
  });
  const router = useRouter();

  async function loadStatus() {
    setErrorMessage(null);
    const [credRes, authRes] = await Promise.all([
      fetch(withBasePath("/api/credentials/status")),
      fetch(withBasePath("/api/spotify/auth/status"))
    ]);
    const credJson = await credRes.json();
    const authJson = await authRes.json();
    setCredStatus(credJson);
    setAuthStatus(authJson);
    if (credJson.clientId && !clientId) {
      setClientId(credJson.clientId);
    }
    if (authJson.authenticated) {
      router.replace("/");
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveCredentials() {
    setStatusMessage(null);
    setErrorMessage(null);
    const res = await fetch(withBasePath("/api/credentials/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret })
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorMessage(data.error ?? "Opslaan mislukt.");
      return;
    }
    setClientSecret("");
    await loadStatus();
    setStatusMessage("Credentials opgeslagen.");
  }

  async function handleClearCredentials() {
    setStatusMessage(null);
    setErrorMessage(null);
    const res = await fetch(withBasePath("/api/credentials/clear"), {
      method: "POST"
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorMessage(data.error ?? "Wissen mislukt.");
      return;
    }
    setClientId("");
    setClientSecret("");
    await loadStatus();
    setStatusMessage("Credentials gewist.");
  }

  function handleLogin() {
    setStatusMessage(null);
    setErrorMessage(null);
    window.location.href = withBasePath("/api/spotify/auth/start");
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <BrandHeader
          title="Spotify credentials"
          subtitle="Sla je Spotify Client ID/Secret op en log in om verder te gaan."
          showNav={false}
        />

        <section className="grid gap-6 rounded-3xl bg-mist/80 p-6 shadow-card backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">
                Spotify Client ID
              </label>
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={credStatus.clientId ?? "Plak je Client ID"}
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-tide focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">
                Spotify Client Secret
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="Plak je Client Secret"
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-tide focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSaveCredentials}
                className="rounded-full bg-tide px-5 py-2.5 text-sm font-semibold text-black shadow-glow transition hover:bg-pulse"
              >
                Opslaan credentials
              </button>
              <button
                onClick={handleClearCredentials}
                className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:border-white/40"
              >
                Wis credentials
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/50 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Status
              </p>
              <div className="mt-2 flex flex-col gap-2 text-sm text-white/80">
                <span>
                  Credentials: {credStatus.hasCredentials ? "opgeslagen" : "ontbreekt"}
                </span>
                <span>
                  Spotify auth: {authStatus.authenticated ? "ingelogd" : "niet ingelogd"}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogin}
              disabled={!credStatus.hasCredentials}
              className="rounded-full bg-tide px-5 py-2.5 text-sm font-semibold text-black shadow-glow transition hover:bg-pulse disabled:cursor-not-allowed disabled:opacity-50"
            >
              Inloggen met Spotify
            </button>
            <p className="text-xs text-white/50">
              Na inloggen worden tokens server-side bewaard. Geen tokens in de
              browser.
            </p>
          </div>
        </section>

        {statusMessage && (
          <div className="rounded-2xl border border-tide/30 bg-tide/10 px-4 py-3 text-sm text-tide">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}
      </div>
    </main>
  );
}
