import { readJson, storageKeys, writeJson } from "./client";

/** Local favorites persistence — Phase A groundwork; same dedupe rule as the Phase-2 DB schema: unique per (kind, refId). */

export type FavoriteKind = "ayah" | "hadith" | "dhikr";

export type FavoriteItem = {
  id: string; // `${kind}:${refId}` — synthetic, stable
  kind: FavoriteKind;
  refId: string; // "112:3" | "66529" | "hisn-28-99"
  title: string;
  text: string;
  subtitle?: string;
  createdAt: string; // ISO
};

export async function getFavorites(): Promise<FavoriteItem[]> {
  return (await readJson<FavoriteItem[]>(storageKeys.favorites)) ?? [];
}

export async function isFavorite(
  kind: FavoriteKind,
  refId: string,
): Promise<boolean> {
  const favorites = await getFavorites();
  return favorites.some((item) => item.kind === kind && item.refId === refId);
}

export async function addFavorite(
  item: Omit<FavoriteItem, "id" | "createdAt">,
): Promise<FavoriteItem> {
  const favorites = await getFavorites();
  const existing = favorites.find(
    (candidate) =>
      candidate.kind === item.kind && candidate.refId === item.refId,
  );
  if (existing) return existing;
  const created: FavoriteItem = {
    ...item,
    id: `${item.kind}:${item.refId}`,
    createdAt: new Date().toISOString(),
  };
  await writeJson(storageKeys.favorites, [created, ...favorites]);
  return created;
}

export async function removeFavorite(
  kind: FavoriteKind,
  refId: string,
): Promise<void> {
  const favorites = await getFavorites();
  await writeJson(
    storageKeys.favorites,
    favorites.filter(
      (item) => !(item.kind === kind && item.refId === refId),
    ),
  );
}

/** Returns the new state (true = now favorited). */
export async function toggleFavorite(
  item: Omit<FavoriteItem, "id" | "createdAt">,
): Promise<boolean> {
  if (await isFavorite(item.kind, item.refId)) {
    await removeFavorite(item.kind, item.refId);
    return false;
  }
  await addFavorite(item);
  return true;
}
