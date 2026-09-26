export const PLAY_ORIGIN = "https://play.google.com";
export function validId(id) {
  return (
    typeof id === "string" &&
    id.length <= 180 &&
    /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(id)
  );
}
export function playUrl(id) {
  if (!validId(id)) throw new Error("Invalid Android package ID.");
  return `${PLAY_ORIGIN}/store/apps/details?id=${encodeURIComponent(id)}`;
}
export function parsePlayUrl(value) {
  try {
    const u = new URL(value.trim());
    const id = u.searchParams.get("id");
    if (
      u.protocol !== "https:" ||
      u.hostname !== "play.google.com" ||
      u.port ||
      u.username ||
      u.password ||
      u.pathname !== "/store/apps/details" ||
      u.searchParams.getAll("id").length !== 1 ||
      !validId(id)
    )
      return null;
    return { id, url: playUrl(id) };
  } catch {
    return null;
  }
}
export function deviceCategory(ua = "") {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  return "Desktop";
}
export function browserCategory(ua = "") {
  if (/edg/i.test(ua)) return "Edge";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
}
// Strip metadata control bytes, retaining ordinary whitespace.
export function text(value, limit = 200) {
  return typeof value === "string"
    ? value
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .trim()
        .slice(0, limit)
    : "";
}
export function imageUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      (u.hostname === "play-lh.googleusercontent.com" ||
        u.hostname === "lh3.googleusercontent.com")
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function validateCollection(input) {
  const title = text(input?.title, 80),
    description = text(input?.description, 500);
  if (!title) throw new Error("Give your collection a title.");
  if (
    !Array.isArray(input?.ids) ||
    input.ids.length < 1 ||
    input.ids.length > 20 ||
    !input.ids.every(validId)
  )
    throw new Error("Choose between 1 and 20 Android apps.");
  return { title, description, ids: [...new Set(input.ids)] };
}
export function validateQR(url, options = {}) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname))
  )
    throw new Error("Use a secure share link.");
  if (url.length > 2048)
    throw new Error("This link is too long for a reliable QR code.");
  const color = ["#142e25", "#121826", "#173e82"].includes(options.color)
    ? options.color
    : "#142e25";
  const size = [512, 1024, 2048].includes(Number(options.size))
    ? Number(options.size)
    : 1024;
  return {
    color,
    size,
    background: options.background === "cream" ? "#fff9eb" : "#ffffff",
  };
}
export function smartDestination(link, ua, frontend) {
  return link.kind === "app" && deviceCategory(ua) === "Android"
    ? playUrl(link.ids[0])
    : `${frontend}#share/${encodeURIComponent(link.code)}`;
}

