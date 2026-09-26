export function csvCell(value) {
  let text = String(value ?? "");
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function analyticsCSV(link, rows, range) {
  const header = [
    "Link code",
    "Title",
    "Period",
    "Date (UTC)",
    "Device",
    "Browser",
    "Country",
    "Visits",
  ];
  return (
    "\uFEFF" +
    [
      header,
      ...rows.map((row) => [
        link.code,
        link.title,
        range,
        row.day,
        row.device,
        row.browser,
        row.country,
        row.count,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}

