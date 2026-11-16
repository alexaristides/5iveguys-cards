import * as THREE from "three";
import { hashString } from "../math";

/** "home" and "black" are the 5ive Guys kits; story mode adds a kit per club (`defineKit`). */
export type KitId = string;

export interface Kit {
  id: KitId;
  label: string;
  shirt: string;
  /** Slightly darker shade for the jacquard pattern on the shirt. */
  pattern: string;
  trim: string;
  text: string;
  shorts: string;
  socks: string;
  /** HUD colour for this side. */
  hud: string;
  /** Across the chest (default "5IVE"). */
  chest?: string;
}

// Colours from the Home Kit and Black Kit cards.
export const KITS: Record<"home" | "black", Kit> & Record<KitId, Kit> = {
  home: {
    id: "home", label: "5IVE", shirt: "#a326d6", pattern: "#9020c0", trim: "#ffffff", text: "#ffffff",
    shorts: "#f4f4f5", socks: "#141414", hud: "#a855f7",
  },
  black: {
    id: "black", label: "GUYS", shirt: "#141414", pattern: "#1d1d1d", trim: "#d4af37", text: "#d4af37",
    shorts: "#141414", socks: "#141414", hud: "#fbbf24",
  },
};

/** Add (or replace) a kit, e.g. a story-mode club's. */
export function defineKit(kit: Kit) {
  KITS[kit.id] = kit;
}

const W = 512;
const H = 256;

/**
 * Shirt texture for the torso lathe (u: around the body starting at the left side,
 * so the back is centred at u=0.25 and the front at u=0.75; v: waist → neck).
 */
export function shirtTexture(kit: Kit, name: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  g.fillStyle = kit.shirt;
  g.fillRect(0, 0, W, H);

  // Jacquard pattern: small diagonal "5" marks like the real shirt.
  g.fillStyle = kit.pattern;
  g.font = "bold 14px Arial Black, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let y = 10; y < H; y += 22) {
    for (let x = (y / 22) % 2 ? 11 : 0; x < W; x += 22) g.fillText("5", x, y);
  }

  const frontX = W * 0.75;
  const backX = W * 0.25;

  // V collar at the front, collar band all round the neck.
  g.fillStyle = kit.trim;
  g.fillRect(0, 0, W, 9);
  g.beginPath();
  g.moveTo(frontX - 34, 0);
  g.lineTo(frontX, 52);
  g.lineTo(frontX + 34, 0);
  g.lineTo(frontX + 22, 0);
  g.lineTo(frontX, 36);
  g.lineTo(frontX - 22, 0);
  g.closePath();
  g.fill();
  g.fillStyle = kit.shirt;
  g.beginPath();
  g.moveTo(frontX - 20, 9);
  g.lineTo(frontX, 33);
  g.lineTo(frontX + 20, 9);
  g.closePath();
  g.fill();

  // Hem trim.
  g.fillStyle = kit.trim;
  g.globalAlpha = 0.85;
  g.fillRect(0, H - 6, W, 6);
  g.globalAlpha = 1;

  // Front: "5IVE" across the chest and a little crest on the left chest.
  g.fillStyle = kit.text;
  const chest = kit.chest ?? "5IVE";
  g.font = `900 ${chest.length > 5 ? 34 : 46}px Arial Black, Impact, sans-serif`;
  g.fillText(chest, frontX, 112, 190);
  drawCrest(g, frontX + 46, 62, kit);

  // Back: player name and a big 5.
  g.font = "900 34px Arial Black, Impact, sans-serif";
  g.fillText(name.toUpperCase(), backX, 58, 150);
  g.font = "900 96px Arial Black, Impact, sans-serif";
  // The 5ive Guys all wear 5; everyone else gets a number of their own.
  g.fillText(kit.chest ? String(2 + (hashString(name) % 22)) : "5", backX, 140);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawCrest(g: CanvasRenderingContext2D, x: number, y: number, kit: Kit) {
  g.save();
  g.translate(x, y);
  g.fillStyle = kit.text;
  g.beginPath();
  g.moveTo(-11, -12);
  g.lineTo(11, -12);
  g.lineTo(11, 2);
  g.quadraticCurveTo(11, 12, 0, 16);
  g.quadraticCurveTo(-11, 12, -11, 2);
  g.closePath();
  g.fill();
  g.fillStyle = kit.shirt;
  g.font = "900 13px Arial Black, sans-serif";
  g.fillText((kit.chest ?? "5")[0], 0, 1);
  g.restore();
}
