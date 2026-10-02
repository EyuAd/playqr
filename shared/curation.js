import { text } from "./domain.js";
export const covers = ["forest", "cobalt", "sunset"];
export const categories = [
  "Everyday",
  "Productivity",
  "Travel",
  "Learning",
  "Wellbeing",
  "Entertainment",
  "Team toolkit",
];
export function curate(input, ids) {
  return {
    cover: covers.includes(input?.cover) ? input.cover : "forest",
    category: categories.includes(input?.category)
      ? input.category
      : "Everyday",
    notes: Object.fromEntries(
      ids.map((id) => [id, text(input?.notes?.[id], 240)]),
    ),
  };
}
