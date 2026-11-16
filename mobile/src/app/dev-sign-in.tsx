import { Redirect } from "expo-router";

/** Target of the dev-only `fiveguys://dev-sign-in?token=…` link (handled in lib/auth.tsx); just goes home. */
export default function DevSignIn() {
  return <Redirect href="/" />;
}
