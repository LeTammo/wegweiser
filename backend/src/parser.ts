/**
 * Deutsche Bahn Share Link Parser
 *
 * Parses connection data from DB share links (bahn.de/buchung/fahrplan/suche#...)
 */

export interface ParsedConnection {
  trainType: string | null;
  trainNumber: string | null;
  startStation: string;
  startTime: Date;
  arrivalStation: string;
  arrivalTime: Date;
  /** Raw parsed fields for debugging */
  _raw?: {
    startStationRaw: string;
    arrivalStationRaw: string;
    startTimeRaw: string;
    arrivalTimeRaw: string;
    lineRaw: string;
  };
}

export interface ParseResult {
  connections: ParsedConnection[];
  origin: string | null;
  destination: string | null;
  travelDate: Date | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a DB compact datetime string like "202606131807" → Date
 * Format: YYYYMMDDHHmm
 */
function parseDbDateTime(raw: string): Date {
  if (raw.length !== 12) throw new Error(`Unexpected datetime string: ${raw}`);
  const year   = parseInt(raw.slice(0, 4), 10);
  const month  = parseInt(raw.slice(4, 6), 10) - 1; // JS months are 0-based
  const day    = parseInt(raw.slice(6, 8), 10);
  const hour   = parseInt(raw.slice(8, 10), 10);
  const minute = parseInt(raw.slice(10, 12), 10);
  return new Date(year, month, day, hour, minute, 0, 0);
}

/**
 * Parse a DB line/vehicle string like "ICE         939", "STR           56",
 * "   S2", "Bus          N5" etc. into { trainType, trainNumber }.
 *
 * The raw value arrives already URL-decoded.
 */
function parseLineString(raw: string): { trainType: string | null; trainNumber: string | null } {
  let s = raw.trim();
  try {
    s = decodeURIComponent(s).trim();
  } catch {
    // fallback to original if decode fails
  }

  if (!s) return { trainType: null, trainNumber: null };

  // Patterns where the type prefix is known
  const prefixPatterns: Array<[RegExp, string]> = [
    [/^ICE\s+(\S+)$/i,  "ICE"],
    [/^IC\s+(\S+)$/i,   "IC"],
    [/^EC\s+(\S+)$/i,   "EC"],
    [/^RE\s+(\S+)$/i,   "RE"],
    [/^RB\s+(\S+)$/i,   "RB"],
    [/^IR\s+(\S+)$/i,   "IR"],
    [/^TGV\s+(\S+)$/i,  "TGV"],
    [/^Bus\s+(\S+)$/i,  "Bus"],
    [/^STR\s+(\S+)$/i,  "Tram"],   // Straßenbahn
    [/^U\s+(\S+)$/i,    "U"],       // U-Bahn
    [/^FLX\s+(\S+)$/i,  "FLX"],
  ];

  for (const [pattern, type] of prefixPatterns) {
    const m = s.match(pattern);
    if (m) return { trainType: type, trainNumber: m[1] };
  }

  // S-Bahn: the "S" is at the END, e.g. "               S2"
  // After trimming it looks like "S2" or "S 2"
  const sBahnMatch = s.match(/^S\s*(\d+\w*)$/i);
  if (sBahnMatch) return { trainType: "S", trainNumber: sBahnMatch[1] };

  // Pure number → unknown type
  const numberOnlyMatch = s.match(/^(\d+\w*)$/);
  if (numberOnlyMatch) return { trainType: null, trainNumber: numberOnlyMatch[1] };

  // Fallback: split on whitespace, try first token as type
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    return { trainType: parts[0], trainNumber: parts.slice(1).join(" ") };
  }

  return { trainType: null, trainNumber: s };
}

/**
 * Extract the station name from a DB station descriptor like:
 *   "A=1@O=Berlin Gesundbrunnen@X=13388516@Y=52548961@L=8011102@a=128@"
 */
function extractStationName(descriptor: string): string {
  const match = descriptor.match(/O=([^@]+)/);
  let name = match ? match[1] : descriptor;
  try {
    return decodeURIComponent(name.replace(/\+/g, ' ')).trim();
  } catch {
    return name.replace(/\+/g, ' ').trim();
  }
}

// ---------------------------------------------------------------------------
// Segment (T = transit / W = walk) parser
// ---------------------------------------------------------------------------

/**
 * Parse one "T$…$…$startDT$endDT$lineName$$…" segment.
 * Returns null for walk segments (W) or anything we cannot parse.
 */
function parseSegment(raw: string): ParsedConnection | null {
  // We only care about transit segments (start with "T$")
  if (!raw.startsWith("T$")) return null;

  // Remove the leading "T$"
  const body = raw.slice(2);

  // Split by "$"
  const parts = body.split("$");

  // Expected layout (0-based after the "T$" prefix):
  //   0: start station descriptor
  //   1: arrival station descriptor
  //   2: start datetime (12 chars)
  //   3: arrival datetime (12 chars)
  //   4: line/vehicle string
  //   5: (empty or supplementary)
  //   ...

  if (parts.length < 5) return null;

  const startStationRaw  = parts[0];
  const arrivalStationRaw = parts[1];
  const startTimeRaw     = parts[2];
  const arrivalTimeRaw   = parts[3];
  const lineRaw          = parts[4];

  if (startTimeRaw.length !== 12 || arrivalTimeRaw.length !== 12) return null;

  let startTime: Date;
  let arrivalTime: Date;
  try {
    startTime   = parseDbDateTime(startTimeRaw);
    arrivalTime = parseDbDateTime(arrivalTimeRaw);
  } catch {
    return null;
  }

  const startStation   = extractStationName(startStationRaw);
  const arrivalStation = extractStationName(arrivalStationRaw);
  const { trainType, trainNumber } = parseLineString(lineRaw);

  return {
    trainType,
    trainNumber,
    startStation,
    startTime,
    arrivalStation,
    arrivalTime,
    _raw: { startStationRaw, arrivalStationRaw, startTimeRaw, arrivalTimeRaw, lineRaw },
  };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a Deutsche Bahn share link and extract all connections.
 *
 * @param url - Full DB share URL (or just the fragment / hash part)
 * @param includeRaw - Whether to keep `_raw` debug fields (default: false)
 */
export function parseDbShareLink(url: string, includeRaw = false): ParseResult {
  // ---- 1. Extract the fragment (#...) ----------------------------------
  const hashIndex = url.indexOf("#");
  const fragment  = hashIndex >= 0 ? url.slice(hashIndex + 1) : url;

  // ---- 2. URL-decode the fragment --------------------------------------
  const decoded = decodeURIComponent(fragment);

  // ---- 3. Extract the "gh=..." parameter which holds the journey data --
  // The gh value starts after "gh=" and ends at the next "&" that is NOT
  // inside the encoded journey block. Because the journey block itself
  // contains encoded & chars we look for the gh= value as everything from
  // "gh=" up to the first occurrence of "¶" section markers or the very
  // specific "¶HKI¶" prefix.
  const ghMatch = decoded.match(/gh=([^&]+(?:&[^&]*)*)/);
  if (!ghMatch) {
    return { connections: [], origin: null, destination: null, travelDate: null };
  }
  const ghRaw = ghMatch[1];

  // ---- 4. Extract metadata from the simple query params ----------------
  const soMatch  = decoded.match(/so=([^&]+)/);
  const zoMatch  = decoded.match(/zo=([^&]+)/);
  const hdMatch  = decoded.match(/hd=([^&]+)/);

  const origin      = soMatch  ? decodeURIComponent(soMatch[1])  : null;
  const destination = zoMatch  ? decodeURIComponent(zoMatch[1])  : null;
  const travelDate  = hdMatch  ? new Date(hdMatch[1])            : null;

  // ---- 5. Isolate the HKI block ----------------------------------------
  // The journey segments live between "¶HKI¶" and "¶GP¶"
  const hkiStart = ghRaw.indexOf("¶HKI¶");
  const hkiEnd   = ghRaw.indexOf("¶GP¶");
  if (hkiStart === -1) {
    return { connections: [], origin, destination, travelDate };
  }
  const hkiBlock = hkiEnd > hkiStart
    ? ghRaw.slice(hkiStart + 5, hkiEnd)   // 5 = length of "¶HKI¶"
    : ghRaw.slice(hkiStart + 5);

  // ---- 6. Split the HKI block into individual segments -----------------
  // Segments are separated by "§"
  const rawSegments = hkiBlock.split("§");

  // ---- 7. Parse each segment -------------------------------------------
  const connections: ParsedConnection[] = [];

  for (const seg of rawSegments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    const conn = parseSegment(trimmed);
    if (!conn) continue;

    if (!includeRaw) delete conn._raw;
    connections.push(conn);
  }

  return { connections, origin, destination, travelDate };
}
