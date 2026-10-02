import { librarySnapshot } from "./library.js";

export const MAX_BACKUP_BYTES = 1024 * 1024;
export function createBackup(library) {
  return {
    format: "playqr-library",
    version: 1,
    library: librarySnapshot(library),
  };
}
export function parseBackup(value) {
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).length > MAX_BACKUP_BYTES
  )
    throw new Error("Choose a PlayQR backup smaller than 1 MB.");
  let data;
  try {
    data = JSON.parse(value);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (data?.format !== "playqr-library" || data.version !== 1)
    throw new Error("This is not a supported PlayQR library backup.");
  return librarySnapshot(data.library);
}
export function mergeBackup(
  current,
  incoming,
  makeId = () => crypto.randomUUID(),
) {
  const base = librarySnapshot(current),
    added = librarySnapshot(incoming);
  const favorites = [...base.favorites];
  const appIds = new Set(favorites.map((a) => a.id));
  for (const app of added.favorites)
    if (!appIds.has(app.id)) {
      favorites.push(app);
      appIds.add(app.id);
    }
  const collections = [...base.collections];
  const signature = ({ id: _id, ...draft }) => JSON.stringify(draft);
  const contents = new Set(collections.map(signature));
  const ids = new Set(collections.map((c) => c.id));
  for (const draft of added.collections) {
    const fingerprint = signature(draft);
    if (contents.has(fingerprint)) continue;
    const copy = { ...draft, id: ids.has(draft.id) ? makeId() : draft.id };
    if (ids.has(copy.id))
      throw new Error("Could not create a unique collection ID. Please retry.");
    collections.push(copy);
    ids.add(copy.id);
    contents.add(fingerprint);
  }
  if (favorites.length > 100 || collections.length > 100)
    throw new Error(
      "This import would exceed the limit of 100 favorites or 100 collections. Nothing was changed.",
    );
  return librarySnapshot({ favorites, collections });
}
