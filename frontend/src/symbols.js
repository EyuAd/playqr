const paths = {
  close: ["M6 6l12 12M6 18 18 6"],
  x: ["M4 3h4l12 18h-4L4 3ZM20 3 4 21"],
  telegram: ["m21 3-7 18-4-8-8-4 19-6ZM10 13l11-10"],
  whatsapp: [
    "M21 11.5a9 9 0 0 1-13.7 7.7L3 21l1.8-4.3A9 9 0 1 1 21 11.5Z",
    "m8 7 2 3-1 1c1 2 2 3 4 4l1-1 3 2c-1 3-4 2-7-1s-4-6-2-8Z",
  ],
  mail: ["M3 5h18v14H3V5Zm0 1 9 7 9-7"],
  download: ["M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"],
  compass: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "m16 8-3 5-5 3 3-5 5-3Z"],
  library: ["M3 4h4v16H3zM10 4h4v16h-4zM16 5l3-1 3 15-3 1-3-15Z"],
  user: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "M5 21v-2a7 7 0 0 1 14 0v2"],
  bookmark: ["M6 3h12v18l-6-4-6 4V3Z"],
  devices: ["M3 4h13v11H3zM7 19h5M9.5 15v4M18 9h4v12h-7V9h3Z"],
  lock: ["M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3"],
  search: ["M21 21l-5-5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"],
  arrow: ["M5 19 19 5M5 5h14v14"],
  "arrow-right": ["M4 12h16m-6-6 6 6-6 6"],
  moon: ["M20 15.1A8.5 8.5 0 0 1 8.9 4 8.5 8.5 0 1 0 20 15.1Z"],
  sun: [
    "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
    "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  ],
  scan: [
    "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7h3v3H7zm7 0h3v3h-3zM7 14h3v3H7zm7 0h3v3h-3z",
  ],
  stack: ["m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4"],
  link: [
    "m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  ],
  archive: ["M3 4h18v5H3zM5 9v11h14V9M9 13h6"],
};
export function symbol(name, className = "symbol") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: className,
  }))
    svg.setAttribute(key, value);
  for (const d of paths[name] || paths.arrow) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
