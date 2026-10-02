export function reorderApps(apps, index, direction) {
  const next = [...apps],
    target = index + direction;
  if (
    !Number.isInteger(index) ||
    ![-1, 1].includes(direction) ||
    index < 0 ||
    index >= next.length ||
    target < 0 ||
    target >= next.length
  )
    return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function duplicateCollection(collection, id) {
  return {
    id,
    title: `${collection.title.slice(0, 73)} (copy)`,
    description: collection.description,
    cover: collection.cover,
    category: collection.category,
    notes: { ...collection.notes },
    apps: collection.apps.map((app) => ({ ...app })),
  };
}
