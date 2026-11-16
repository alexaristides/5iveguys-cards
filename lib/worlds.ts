/**
 * The channels ("worlds") the website shows for now, in display order. Any other
 * channel in the DB is hidden from the site. Add a slug here to bring one back.
 */
export const WORLDS = [
  { slug: "5iveguysfc", name: "5ive Guys" },
  { slug: "OGFC", name: "Other Guys" },
] as const;

export const WORLD_SLUGS: string[] = WORLDS.map((w) => w.slug);

export function isWorld(slug: string): boolean {
  return WORLD_SLUGS.includes(slug);
}

export function worldName(slug: string): string | undefined {
  return WORLDS.find((w) => w.slug === slug)?.name;
}
