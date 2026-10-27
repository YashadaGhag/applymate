// Plain-text helpers shared by the careers-source adapters (moved out of fetchJobs.js, unchanged).

// Named HTML codes seen in (or likely in) job-board rich text. An unknown name is left as written
// rather than guessed at; numeric codes (&#8212; / &#x2014;) are always decoded.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  shy: "", zwj: "", zwnj: "", mdash: "—", ndash: "–", minus: "−", hellip: "…", bull: "•",
  middot: "·", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", sbquo: "‚", bdquo: "„",
  laquo: "«", raquo: "»", prime: "′", copy: "©", reg: "®", trade: "™", deg: "°", times: "×",
  divide: "÷", plusmn: "±", frac12: "½", frac14: "¼", frac34: "¾", sect: "§", para: "¶",
  dagger: "†", euro: "€", pound: "£", cent: "¢", yen: "¥", rarr: "→", larr: "←", check: "✓",
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ",
  ccedil: "ç", eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", iacute: "í", igrave: "ì",
  icirc: "î", iuml: "ï", ntilde: "ñ", oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ",
  ouml: "ö", oslash: "ø", uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü", yacute: "ý",
  szlig: "ß", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
  Ouml: "Ö", Uuml: "Ü", Auml: "Ä",
};

function decodeEntity(match, body) {
  if (body[0] === "#") {
    const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }
  return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match;
}

// Some Greenhouse boards double-encode (an author's literal "&amp;" in the source rich text
// gets entity-encoded again by the API into "&amp;amp;", and "—" arrives as "&amp;mdash;") — a
// single decode pass only strips one layer. Loop until a pass makes no change.
export function decodeHtmlEntities(str) {
  let result = str;
  let previous;
  do {
    previous = result;
    result = result.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, decodeEntity);
  } while (result !== previous);
  return result;
}

// Greenhouse's "content" field is HTML, entity-encoded inside the JSON string
// (literal "&lt;h2&gt;..." in the response) — decode once, then strip tags.
export function htmlToPlainText(html) {
  if (!html) return "";
  return decodeHtmlEntities(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sanitized description HTML -> plain text that keeps one line per paragraph / list item.
export function htmlToLines(html) {
  if (!html) return "";
  return decodeHtmlEntities(html.replace(/<\/(p|li|h[1-6]|ul|ol|div)>|<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
