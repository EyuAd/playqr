import { jsPDF } from "jspdf";

export function cardPDF(canvas, title, destination) {
  const url = new URL(destination);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Invalid PDF destination.");
  // 6 x 7.5 inches: the same 4:5 ratio as the card, with no cropping.
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [432, 540],
    compress: true,
  });
  doc.setProperties({
    title: String(title || "PlayQR")
      .split("")
      .filter((char) => char.charCodeAt(0) >= 32)
      .join("")
      .slice(0, 160),
    creator: "PlayQR",
  });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 432, 540);
  // The printed QR and clickable digital card point to the exact same link.
  doc.link(0, 0, 432, 540, { url: url.href });
  return doc.output("blob");
}
