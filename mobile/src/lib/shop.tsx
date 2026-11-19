/**
 * Buying player packs with Apple In-App Purchase (StoreKit 2 via expo-iap).
 *
 * buy() starts an order on the server, then asks the App Store for the one pack product with
 * the order id as the purchase's appAccountToken. expo-iap's purchase flow sends every signed
 * transaction to /api/shop/apple, which verifies it and pays the order, and only then finishes
 * the transaction. Anything left unfinished (app killed mid-purchase, no signal) is recovered
 * the next time the store connects or the app comes back to the foreground.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  createPurchaseFlow, getUserFriendlyErrorMessage, isUserCancelledError, useIAP,
  type Purchase, type PurchaseConfirmation, type PurchaseFlowOutcome,
} from "expo-iap";
import { PLAYER_PACK } from "@shared/player-packs";
import { api } from "./api";
import { useAuth } from "./auth";
import { FEATURES } from "./config";

/** A finished purchase's pack, `pending` when Apple or the server hasn't settled it yet, an error, or null when cancelled. */
export type BuyResult = { packId: string } | { pending: true; message: string } | { error: string } | null;

interface Shop {
  /** The App Store's price for a pack in the buyer's currency, or the default until it loads. */
  price: string;
  /** Whether a pack can be bought right now. */
  canBuy: boolean;
  /** Why not, when it can't. */
  unavailable: string | null;
  buy: (channelSlug: string, playerName: string) => Promise<BuyResult>;
}

const ShopContext = createContext<Shop | null>(null);

const OFF: Shop = {
  price: PLAYER_PACK.price,
  canBuy: false,
  unavailable: "Packs aren't on sale right now.",
  buy: async () => null,
};

export function useShopPurchases(): Shop {
  return useContext(ShopContext) ?? OFF;
}

/** Wraps the signed-in app; the store connection lives only while someone is signed in. */
export function ShopProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  if (!FEATURES.shop || !signedIn) return <>{children}</>;
  return <StoreConnection>{children}</StoreConnection>;
}

const wasCancelled = (err: unknown) => isUserCancelledError(err);
const PENDING_MESSAGE = "Your payment went through. Your pack will be in Cards as soon as it's confirmed.";

function StoreConnection({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  /** The purchase the user is waiting on, by order id (= the App Store appAccountToken). */
  const waiting = useRef<{ orderId: string; resolve: (r: BuyResult) => void } | null>(null);
  /** Server pack id for each confirmed App Store transaction. */
  const [packIds] = useState(() => new Map<string, string>());

  const flow = useMemo(
    () =>
      createPurchaseFlow({
        isConsumable: () => true,
        confirmWithBackend: async (purchase) => {
          if (!purchase.purchaseToken) return { status: "verification_delayed", retryAfterMs: 30_000 };
          const res = await api<PurchaseConfirmation & { packId?: string }>("/api/shop/apple", {
            body: { purchaseToken: purchase.purchaseToken },
          });
          if (res.status === "entitled" && res.packId) packIds.set(purchase.id, res.packId);
          return res;
        },
      }),
    [packIds],
  );
  useEffect(() => () => flow.dispose(), [flow]);

  const settle = useCallback((result: BuyResult) => {
    const w = waiting.current;
    waiting.current = null;
    w?.resolve(result);
  }, []);

  const onOutcome = useCallback(
    ({ purchase, status }: PurchaseFlowOutcome<Purchase>) => {
      queryClient.invalidateQueries({ queryKey: ["player-packs"] });
      const token = ("appAccountToken" in purchase ? purchase.appAccountToken : null)?.toLowerCase();
      const mine = !!waiting.current && token === waiting.current.orderId;
      if (mine) {
        if (status.status === "entitled") settle({ packId: packIds.get(purchase.id) ?? waiting.current!.orderId });
        else if (status.status === "invalid" || status.status === "failed") {
          settle({ pending: true, message: "Something went wrong confirming your payment. If you were charged, your pack will appear in Cards once it's sorted; if not, contact support." });
        } else if (status.status === "store_pending") {
          settle({ pending: true, message: "Waiting for the purchase to be approved. Your pack will be in Cards once it is." });
        } else settle({ pending: true, message: PENDING_MESSAGE });
      } else if (status.status === "entitled" && !status.alreadyGranted) {
        Alert.alert("Your pack is ready", "A pack you paid for is waiting for you in Cards.");
      }
    },
    [queryClient, settle, packIds],
  );

  const { connected, products, fetchProducts, requestPurchase } = useIAP({
    purchaseFlow: flow,
    onPurchaseFlowOutcome: onOutcome,
    onPurchaseError: (err) => settle(wasCancelled(err) ? null : { error: getUserFriendlyErrorMessage(err) }),
  });

  useEffect(() => {
    if (connected) fetchProducts({ skus: [PLAYER_PACK.productId], type: "in-app" }).catch(() => {});
  }, [connected, fetchProducts]);

  // Back in the foreground: pick up purchases that finished while we were away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && connected) flow.recoverPurchases().catch(() => {});
    });
    return () => sub.remove();
  }, [connected, flow]);

  const product = products.find((p) => p.id === PLAYER_PACK.productId);
  // Without the App Store product (local dev), the dev server can stand in for Apple.
  const devStore = __DEV__ && !product;

  const buy = useCallback(
    async (channelSlug: string, playerName: string): Promise<BuyResult> => {
      if (waiting.current) return null;
      const { orderId } = await api<{ orderId: string }>("/api/shop/orders", { body: { channelSlug, playerName } });
      if (devStore) {
        const res = await api<{ packId: string }>("/api/shop/dev", { body: { orderId } });
        queryClient.invalidateQueries({ queryKey: ["player-packs"] });
        return { packId: res.packId };
      }
      const result = new Promise<BuyResult>((resolve) => {
        waiting.current = { orderId: orderId.toLowerCase(), resolve };
      });
      try {
        await requestPurchase({ request: { apple: { sku: PLAYER_PACK.productId, appAccountToken: orderId } }, type: "in-app" });
      } catch (err) {
        settle(wasCancelled(err) ? null : { error: getUserFriendlyErrorMessage(err as Error) });
      }
      // Paid, but the confirmation is slow: let the user carry on; the pack lands in Cards when it's done.
      const timeout = setTimeout(() => {
        if (waiting.current?.orderId === orderId.toLowerCase()) settle({ pending: true, message: PENDING_MESSAGE });
      }, 60_000);
      return result.finally(() => clearTimeout(timeout));
    },
    [devStore, queryClient, requestPurchase, settle],
  );

  const value = useMemo<Shop>(
    () => ({
      price: product?.displayPrice ?? PLAYER_PACK.price,
      canBuy: !!product || devStore,
      unavailable: product || devStore ? null : connected ? "Packs aren't available in your App Store yet." : "Connecting to the App Store…",
      buy,
    }),
    [product, devStore, connected, buy],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
