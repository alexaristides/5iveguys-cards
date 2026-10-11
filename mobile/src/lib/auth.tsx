import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { api, setApiToken, setUnauthorizedHandler } from "./api";
import { API_URL, CHANNELS } from "./config";

const TOKEN_KEY = "session_token";

interface AuthState {
  ready: boolean;
  signedIn: boolean;
  /** Google sign-in via the website's NextAuth flow in the system auth sheet. */
  signInWithGoogle: () => Promise<void>;
  /** Link Google (YouTube) to the current account, e.g. for Sign in with Apple users. */
  connectYouTube: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Make sure the user has stats (and welcome points) in every channel the app covers. */
async function joinChannels() {
  await Promise.all(
    CHANNELS.map((c) => api(`/api/channels/${c.slug}/join`, { method: "POST" }).catch(() => {})),
  );
}

export class AuthCancelled extends Error {}

/** Opens web-start in the auth sheet and returns the session token it hands back. */
async function runWebGoogleFlow(ticket?: string): Promise<string> {
  const redirect = Linking.createURL("auth");
  const params = new URLSearchParams({ redirect });
  if (ticket) params.set("ticket", ticket);
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_URL}/api/mobile/auth/web-start?${params}`,
    redirect,
    { preferEphemeralSession: true },
  );
  if (result.type !== "success") throw new AuthCancelled();
  const { queryParams } = Linking.parse(result.url);
  const token = queryParams?.token;
  if (typeof token !== "string") {
    if (ticket && queryParams?.error === "OAuthAccountNotLinked") {
      throw new Error("That Google account already has its own 5iveG profile. To use it, sign out and choose Sign in with Google.");
    }
    throw new Error(ticket
      ? "Couldn't connect that Google account. It may already belong to another profile."
      : "Google sign-in failed. Please try again.");
  }
  return token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const applyToken = useCallback(async (next: string | null) => {
    setApiToken(next);
    setToken(next);
    if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((stored) => {
        setApiToken(stored);
        setToken(stored);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void applyToken(null));
    return () => setUnauthorizedHandler(null);
  }, [applyToken]);

  const signInWithGoogle = useCallback(async () => {
    const next = await runWebGoogleFlow();
    setApiToken(next);
    await joinChannels();
    await applyToken(next);
  }, [applyToken]);

  const connectYouTube = useCallback(async () => {
    const { ticket } = await api<{ ticket: string }>("/api/mobile/auth/link-ticket", { method: "POST" });
    const next = await runWebGoogleFlow(ticket);
    const old = token;
    await applyToken(next);
    if (old) await fetch(`${API_URL}/api/mobile/auth/signout`, {
      method: "POST", headers: { Authorization: `Bearer ${old}` }, credentials: "omit",
    }).catch(() => {});
  }, [applyToken, token]);

  const signInWithApple = useCallback(async () => {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (err) {
      if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new AuthCancelled();
      throw err;
    }
    const { token: next } = await api<{ token: string }>("/api/mobile/auth/apple", {
      body: {
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        fullName: credential.fullName,
      },
    });
    setApiToken(next);
    await joinChannels();
    await applyToken(next);
  }, [applyToken]);

  const signOut = useCallback(async () => {
    await api("/api/mobile/auth/signout", { method: "POST" }).catch(() => {});
    await applyToken(null);
  }, [applyToken]);

  const deleteAccount = useCallback(async () => {
    await api("/api/account", { method: "DELETE" });
    await applyToken(null);
  }, [applyToken]);

  const value = useMemo(
    () => ({ ready, signedIn: !!token, signInWithGoogle, connectYouTube, signInWithApple, signOut, deleteAccount }),
    [ready, token, signInWithGoogle, connectYouTube, signInWithApple, signOut, deleteAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
