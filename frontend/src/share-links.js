// Share intents are only followed after an explicit click; no third-party SDKs.
export function shareLinks(title, destination) {
  const url = new URL(destination);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Only web links can be shared.");
  const text = String(title || "PlayQR").slice(0, 180);
  const intent = (base, params) => {
    const link = new URL(base);
    link.search = new URLSearchParams(params).toString();
    return link.href;
  };
  return [
    {
      name: "X",
      icon: "x",
      href: intent("https://twitter.com/intent/tweet", { text, url: url.href }),
    },
    {
      name: "Telegram",
      icon: "telegram",
      href: intent("https://t.me/share/url", { url: url.href, text }),
    },
    {
      name: "WhatsApp",
      icon: "whatsapp",
      href: intent("https://wa.me/", { text: `${text}\n${url.href}` }),
    },
    {
      name: "Email",
      icon: "mail",
      href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n${url.href}`)}`,
    },
  ];
}

export function cardFilename(title, extension) {
  const name =
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "app";
  return `playqr-card-${name}.${extension}`;
}
