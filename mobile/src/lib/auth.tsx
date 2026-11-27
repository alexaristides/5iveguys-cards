import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { api, setApiToken, setUnauthorizedHandler } from "./api";
import { API_URL } from "./config";

const TOKEN_KEY = "session_token";

interface AuthState {
  ready: boolean;
  signedIn: boolean;
  /** Google sign-in via the website's NextAuth flow in the system auth sheet. */
  signInWithGoogle: () => Promise<void>;
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

export class AuthCancelled extends Error {}

/**
 * Opens web-start in the auth sheet and returns the session token it hands back. `basic=1` asks
 * Google for name and email only: the app has no YouTube features, so it doesn't ask for YouTube access.
 */
async function runWebGoogleFlow(): Promise<string> {
  const redirect = Linking.createURL("auth");
  const params = new URLSearchParams({ redirect, basic: "1" });
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_URL}/api/mobile/auth/web-start?${params}`,
    redirect,
    { preferEphemeralSession: true },
  );
  if (result.type !== "success") throw new AuthCancelled();
  const { queryParams } = Linking.parse(result.url);
  const token = queryParams?.token;
  if (typeof token !== "string") throw new Error("Google sign-in failed. Please try again.");
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

  // Dev builds only: `xcrun simctl openurl booted "fiveguys://dev-sign-in?token=<Session token>"` signs the
  // Simulator in as a test user, since Google sign-in can't be automated there. Not compiled into release builds.
  useEffect(() => {
    if (!__DEV__) return;
    const take = (url: string | null) => {
      if (!url) return;
      const { hostname, path, queryParams } = Linking.parse(url);
      if ((hostname ?? path) === "dev-sign-in" && typeof queryParams?.token === "string") void applyToken(queryParams.token);
    };
    Linking.getInitialURL().then(take);
    const sub = Linking.addEventListener("url", ({ url }) => take(url));
    return () => sub.remove();
  }, [applyToken]);

  const signInWithGoogle = useCallback(async () => {
    await applyToken(await runWebGoogleFlow());
  }, [applyToken]);

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
    () => ({ ready, signedIn: !!token, signInWithGoogle, signInWithApple, signOut, deleteAccount }),
    [ready, token, signInWithGoogle, signInWithApple, signOut, deleteAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
