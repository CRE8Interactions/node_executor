const ALLOWED_TABLES = new Set([
  "organizations",
  "venues",
  "events",
  "offers",
  "tickets",
  "orders",
  "packages",
  "flex_packs",
  "invoices",
  "payment_plans",
  "buyer_types",
  "fee_structures",
  "event_stats",
  "rooms",
  "seatmaps",
  "seasons",
  "season_packages",
  "orders_event_links",
  "orders_tickets_links",
  "orders_original_tickets_links",
  "orders_package_links",
  "orders_flex_pack_links",
  "orders_buyer_type_links",
  "events_organization_links",
  "events_venue_links",
  "events_offers_links",
  "packages_events_links",
  "packages_organization_links",
  "packages_venue_links",
  "tickets_offer_links",
  "payment_plans_order_links",
  "invoices_tickets_links",
  "invoices_package_links",
  "season_packages_events_links",
  "season_packages_package_links",
  "reporting.order_facts",
  "reporting.order_ticket_facts",
  "reporting.package_facts",
  "reporting.payment_plan_facts",
  "reporting.attendance_facts"
]);

const BLOCKED_KEYWORDS = [
  "insert","update","delete","drop","alter","truncate",
  "create","grant","revoke","copy","vacuum","analyze",
  "execute","call","do"
];

const FROM_JOIN_PATTERN = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)/gi;
const LIMIT_PATTERN = /\blimit\s+(\d+)\b/i;

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

function extractTables(sql) {
  const out = [];
  let match;
  while ((match = FROM_JOIN_PATTERN.exec(sql)) !== null) {
    out.push(match[1].replaceAll('"', ""));
  }
  return out;
}

export function validate_sql(sql) {
  const cleaned = normalizeSql(sql);
  const lowered = cleaned.toLowerCase();

  if (!cleaned) return [false, "SQL is required."];
  if (cleaned.includes(";")) return [false, "Multiple statements are not allowed."];
  if (!(lowered.startsWith("select ") || lowered.startsWith("with "))) {
    return [false, "Only SELECT/CTE queries are allowed."];
  }
  if (/\bselect\s+\*/i.test(lowered)) return [false, "SELECT * is not allowed."];

  for (const kw of BLOCKED_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(lowered)) return [false, `Blocked keyword detected: ${kw}`];
  }

  if (/\b(pg_catalog|information_schema)\./i.test(lowered)) {
    return [false, "Blocked schema detected."];
  }

  const tables = extractTables(cleaned);
  for (const table of tables) {
    if (!ALLOWED_TABLES.has(table)) return [false, `Table not allowed: ${table}`];
  }

  const isAggregateOnly =
    /\b(sum|count|avg|min|max)\s*\(/i.test(lowered) &&
    !lowered.includes(" group by ") &&
    !lowered.includes(" order by ");

  if (!isAggregateOnly) {
    const m = lowered.match(LIMIT_PATTERN);
    if (!m) return [false, "Detail queries must include LIMIT."];
    if (Number(m[1]) > 500) return [false, "LIMIT cannot exceed 500."];
  }

  return [true, "OK"];
}
