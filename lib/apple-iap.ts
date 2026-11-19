/**
 * Verifies App Store purchases (StoreKit 2 signed transactions) and App Store Server
 * Notifications with Apple's library, against Apple's root certificates. Server only.
 */
import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { APPLE_ROOT_CERTS_BASE64 } from "./apple-root-certs";

export const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.fiveguysfc.cards";
/** The app's Apple ID in App Store Connect (5iveG). */
const APPLE_APP_ID = Number(process.env.APPLE_APP_APPLE_ID || 6821596728);

/**
 * Why a purchase couldn't be verified. `settled` failures (another app's purchase) will never
 * verify, so the app may finish them; anything else is retried later, because finishing a real
 * purchase we failed to verify would take the buyer's money for nothing.
 */
export class AppleVerifyError extends Error {
  constructor(message: string, readonly settled: boolean) {
    super(message);
  }
}

const roots = APPLE_ROOT_CERTS_BASE64.map((b) => Buffer.from(b, "base64"));
const verifiers = new Map<Environment, SignedDataVerifier>();

function verifier(env: Environment) {
  let v = verifiers.get(env);
  if (!v) {
    v = new SignedDataVerifier(roots, true, env, APPLE_BUNDLE_ID, env === Environment.PRODUCTION ? APPLE_APP_ID : undefined);
    verifiers.set(env, v);
  }
  return v;
}

/** Purchases made against a local StoreKit configuration in Xcode aren't signed by Apple: trusted in `next dev` only. */
const xcodeAllowed = () => process.env.NODE_ENV === "development";

function claims(jws: string): Record<string, unknown> {
  try {
    const part = jws.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new AppleVerifyError("That isn't an App Store transaction", false);
  }
}

function environmentOf(name: unknown): Environment {
  if (name === Environment.PRODUCTION) return Environment.PRODUCTION;
  if (name === Environment.SANDBOX) return Environment.SANDBOX;
  if ((name === Environment.XCODE || name === Environment.LOCAL_TESTING) && xcodeAllowed()) return name;
  throw new AppleVerifyError(`Unexpected App Store environment: ${String(name)}`, false);
}

function rethrow(err: unknown): never {
  if (err instanceof AppleVerifyError) throw err;
  if (err instanceof VerificationException) {
    const settled = err.status === VerificationStatus.INVALID_APP_IDENTIFIER;
    throw new AppleVerifyError(`App Store verification failed (${VerificationStatus[err.status]})`, settled);
  }
  throw new AppleVerifyError(`App Store verification failed: ${(err as Error)?.message ?? err}`, false);
}

/** A purchase's signed transaction (the JWS StoreKit 2 hands the app), verified and decoded. */
export async function verifyTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
  try {
    return await verifier(environmentOf(claims(jws).environment)).verifyAndDecodeTransaction(jws);
  } catch (err) {
    rethrow(err);
  }
}

/** An App Store Server Notification (V2), verified and decoded, with its transaction if it has one. */
export async function verifyNotification(signedPayload: string): Promise<{
  notification: ResponseBodyV2DecodedPayload;
  transaction: JWSTransactionDecodedPayload | null;
}> {
  try {
    const data = claims(signedPayload).data as { environment?: string } | undefined;
    const v = verifier(environmentOf(data?.environment));
    const notification = await v.verifyAndDecodeNotification(signedPayload);
    const signed = notification.data?.signedTransactionInfo;
    return { notification, transaction: signed ? await v.verifyAndDecodeTransaction(signed) : null };
  } catch (err) {
    rethrow(err);
  }
}
