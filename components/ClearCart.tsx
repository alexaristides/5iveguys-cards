"use client";

import { useEffect } from "react";
import { clearCart } from "./ShopClient";

/** Empties the shop basket once an order is paid. */
export default function ClearCart() {
  useEffect(() => clearCart(), []);
  return null;
}
