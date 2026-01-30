"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandHeader from "@/app/ui/BrandHeader";
import Button from "@/app/ui/Button";

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
    hasClientSecret?: boolean;
  }>({ hasCredentials: false, hasClientSecret: false });
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean }>({
    authenticated: false
  });
  const router = useRouter();
  const canSave =
    clientId.trim().length > 0 && clientSecret.trim().length > 0;

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
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(withBasePath("/api/session/refresh"), { method: "POST" }).catch(() => {});
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
      setErrorMessage(data.error ?? "Save failed.");
      return;
    }
    setClientSecret("");
    await loadStatus();
    setStatusMessage("Credentials saved.");
  }

  async function handleClearCredentials() {
    setStatusMessage(null);
    setErrorMessage(null);
    const res = await fetch(withBasePath("/api/credentials/clear"), {
      method: "POST"
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorMessage(data.error ?? "Clear failed.");
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
    window.location.href = withBasePath(
      `/api/auth/spotify/login?returnTo=${encodeURIComponent(basePath || "/")}`
    );
  }

  async function handleLogout() {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(withBasePath("/api/session/clear"), {
        method: "POST"
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Logout failed.");
      }
      setClientId("");
      setClientSecret("");
      setCredStatus({ hasCredentials: false });
      setAuthStatus({ authenticated: false });
      setStatusMessage("You have been logged out and everything has been cleared.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <BrandHeader />
        <h1 className="font-display text-3xl font-semibold text-white md:text-4xl">
          Credentials
        </h1>

        <section className="rounded-3xl border border-white/10 bg-black/40 p-6 text-sm text-white/70">
          <h2 className="font-display text-xl font-semibold text-white">
            How to get your Spotify Client ID and Secret
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5">
            <li>
              Go to the Spotify Developer Dashboard and log in with your
              Spotify account.
            </li>
            <li>
              Click <span className="font-semibold">Create an app</span> and
              fill in a name and description.
            </li>
            <li>
              Open your new app and copy the
              <span className="font-semibold"> Client ID</span>.
            </li>
            <li>
              Click <span className="font-semibold">Show client secret</span>
              and copy the <span className="font-semibold">Client Secret</span>.
            </li>
          </ol>

          <h3 className="mt-6 font-display text-lg font-semibold text-white">
            Why do I need to log in to Spotify again?
          </h3>
          <p className="mt-2">
            The Client ID and Secret belong to this app. Spotify then asks for
            your personal permission to read your playlists. That happens via a
            separate Spotify login, so Spotify stays in control of who gets access.
          </p>

          <h3 className="mt-6 font-display text-lg font-semibold text-white">
            What happens to my data?
          </h3>
          <p className="mt-2">
            Your Client Secret and tokens are stored encrypted on the server.
            We only use them to fetch your Spotify data. Nothing is shared with
            third parties.
          </p>
          <p className="mt-2">
            If you click <span className="font-semibold">Log out and clear</span>,
            we delete your stored credentials, tokens, and the session cookie.
            You will need to log in again to use the app.
          </p>
        </section>

        <section className="grid gap-6 rounded-3xl bg-mist p-6 shadow-card md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="spotify-client-id"
                className="text-sm font-medium text-white/80"
              >
                Spotify Client ID
              </label>
              <input
                id="spotify-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={credStatus.clientId ?? "Paste your Client ID"}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-tide focus:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="spotify-client-secret"
                className="text-sm font-medium text-white/80"
              >
                Spotify Client Secret
              </label>
              <input
                type="password"
                id="spotify-client-secret"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="Paste your Client Secret"
                required
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-tide focus:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={handleSaveCredentials}
                disabled={!canSave}
              >
                Save credentials
              </Button>
              <Button
                variant="secondary"
                onClick={handleClearCredentials}
              >
                Clear credentials
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/50 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Status
              </p>
              <div className="mt-2 flex flex-col gap-2 text-sm text-white/80">
                <span>
                  Credentials: {credStatus.hasCredentials ? "saved" : "missing"}
                </span>
                <span>
                  Client ID: {credStatus.clientId ? "saved" : "missing"}
                </span>
                <span>
                  Client Secret: {credStatus.hasClientSecret ? "saved" : "missing"}
                </span>
                <span>
                  Spotify auth: {authStatus.authenticated ? "logged in" : "not logged in"}
                </span>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleLogin}
              disabled={!credStatus.hasCredentials}
            >
              Log in with Spotify
            </Button>
            <Button
              variant="secondary"
              onClick={handleLogout}
            >
              Log out and clear
            </Button>
            <p className="text-xs text-white/50">
              After login, tokens are stored server-side. No tokens in the browser.
            </p>
          </div>
        </section>

        {statusMessage && (
          <div
            className="rounded-2xl border border-tide/30 bg-tide/10 px-4 py-3 text-sm text-tide"
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div
            className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {errorMessage}
          </div>
        )}
      </div>
    </main>
  );
}
