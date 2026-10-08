// Builds a CSV that opens correctly in Excel (UTF-8 BOM so ₹ and accents survive)
const esc = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(transactions) {
  const header = ["Date", "Title", "Type", "Category", "Amount", "Note"];
  const rows = transactions.map((t) => [
    new Date(t.date).toLocaleDateString("en-CA"),
    t.title,
    t.type,
    t.category_name ?? "",
    Number(t.amount).toFixed(2),
    t.note ?? "",
  ]);
  return "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadCSV(transactions, name = "transactions") {
  const blob = new Blob([toCSV(transactions)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toLocaleDateString("en-CA")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
