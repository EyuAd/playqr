import { text, validAppId, imageUrl } from "./domain.js";
import { curate } from "./curation.js";

export function librarySnapshot(input) {
  const apps = (values) => {
    if (!Array.isArray(values) || values.length > 100)
      throw new Error("Invalid saved apps.");
    const seen = new Set();
    return values.map((a) => {
      if (!validAppId(a?.id) || !text(a.title, 160) || seen.has(a.id))
        throw new Error("Invalid or duplicate saved app.");
      seen.add(a.id);
      return {
        id: a.id,
        title: text(a.title, 160),
        developer: text(a.developer, 160),
        icon: imageUrl(a.icon),
      };
    });
  };
  if (
    !input ||
    !Array.isArray(input.collections) ||
    input.collections.length > 100
  )
    throw new Error("Invalid collection library.");
  const seen = new Set();
  return {
    favorites: apps(input.favorites),
    collections: input.collections.map((c) => {
      if (
        !/^[a-f0-9-]{36}$/.test(c?.id || "") ||
        seen.has(c.id) ||
        !Array.isArray(c.apps) ||
        c.apps.length > 20
      )
        throw new Error("Invalid collection draft.");
      seen.add(c.id);
      const items = apps(c.apps);
      return {
        id: c.id,
        title: text(c.title, 80),
        description: text(c.description, 500),
        apps: items,
        ...curate(
          c,
          items.map((a) => a.id),
        ),
      };
    }),
  };
}
