import { flatten } from "./scoreJob.js";

/**
 * "What changed", built in plain code by comparing a tailored draft with the original resume
 * text, section by section. Only edits that can be seen in the comparison are reported, so the
 * list can't describe an edit that wasn't made (the model's own list did, in the first real call).
 *
 * Reports: summary added or rewritten; bullets reworded, removed and reordered per role (and per
 * entry in other sections like Projects); sections reordered; headings renamed; skills reworded,
 * removed and reordered. Returns short plain-language strings, possibly none.
 *
 * The resume is plain text from a PDF/DOCX, so its structure is found from the draft: each role's
 * title and dates locate its header line, and the bullets under it run to the next role, heading
 * or employer line. Lines are wrapped, so bullets are split on bullet characters.
 */
export function describeChanges({ blocks, resumeText }) {
  const lines = resumeText.split(/\r?\n/).map((l) => l.trim());
  const headings = lines.map((l, i) => (isHeadingLine(l) ? i : -1)).filter((i) => i >= 0);
  const organizations = blocks.filter((b) => b.kind === "role").map((b) => flatten(b.organization));
  const items = [];

  // Summary.
  const summary = blocks.find((b) => b.kind === "summary");
  if (summary) {
    const hadSummary = headings.some((i) => /^(summary|professional summary|profile|about( me)?|objective)$/i.test(lines[i]));
    const draftText = summary.paragraphs.join(" ");
    if (!hadSummary) items.push("Added a summary written from your resume");
    else if (!flatten(resumeText).includes(flatten(draftText))) items.push("Summary rewritten");
  }

  // Units with bullets: roles, and entries in other sections. Each is located by its header line.
  const units = [];
  const usedLines = new Set();
  for (const b of blocks) {
    if (b.kind === "role") units.push({ section: b.section, label: b.title, title: b.title, dates: b.dates, bullets: b.bullets, block: b });
    if (b.kind === "other") {
      for (const e of b.entries) units.push({ section: b.section, label: e.title ?? b.section, title: e.title, dates: e.dates, bullets: e.bullets, block: b });
    }
  }
  const sameTitle = (u) => units.filter((x) => x.label === u.label).length > 1;
  for (const u of units) u.line = findHeaderLine(lines, u, usedLines);
  const starts = units.map((u) => u.line).filter((i) => i >= 0);

  for (const u of units) {
    if (u.line < 0) continue;
    const label = sameTitle(u) && u.block.organization ? `${u.label} at ${u.block.organization}` : u.label;
    const end = Math.min(
      ...starts.filter((i) => i > u.line),
      ...headings.filter((i) => i > u.line),
      ...lines.map((l, i) => (i > u.line && isEmployerLine(l, organizations) ? i : Infinity)),
      lines.length
    );
    const original = splitBullets(lines.slice(u.line + 1, end));
    const { reworded, removed, reordered } = compareBullets(original, u.bullets);
    if (reworded) items.push(`${reworded} ${plural(reworded, "bullet")} reworded in ${label}`);
    if (reordered) items.push(`Bullets reordered in ${label}`);
    if (removed) items.push(`${removed} ${plural(removed, "bullet")} removed from ${label}`);
  }

  // Sections: order and headings. Each draft section maps to the resume heading above its content.
  const sectionAnchors = [];
  for (const b of blocks) {
    if (b.kind === "header" || b.kind === "summary") continue;
    if (sectionAnchors.some((s) => s.section === b.section)) continue;
    const line = anchorLine(b, lines, units, headings);
    if (line < 0) continue;
    const heading = [...headings].reverse().find((i) => i <= line);
    sectionAnchors.push({ section: b.section, line, heading: heading === undefined ? null : lines[heading] });
  }
  const resumeOrder = [...sectionAnchors].sort((a, b) => a.line - b.line).map((s) => s.section);
  if (resumeOrder.some((s, i) => s !== sectionAnchors[i].section)) {
    items.push(`Sections reordered: ${sectionAnchors.map((s) => s.section).join(", ")}`);
  }
  const renamed = sectionAnchors.filter((s) => s.heading && flatten(s.heading) !== flatten(s.section));
  if (renamed.length) {
    items.push(`Headings renamed to standard ones: ${renamed.map((s) => `${titleCase(s.heading)} to ${s.section}`).join("; ")}`);
  }

  // Skills.
  const skills = blocks.find((b) => b.kind === "skills");
  if (skills) items.push(...compareSkills(skills, lines, headings));

  return items;
}

function plural(n, word) {
  return n === 1 ? word : `${word}s`;
}

function titleCase(text) {
  return text.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

// "WORK EXPERIENCE", "SKILLS & TOOLS", or a short title-case line like "Education".
function isHeadingLine(line) {
  if (!line || line.length > 40 || /\d/.test(line)) return false;
  if (/^[A-Z][A-Z &/,'-]+$/.test(line) && /[A-Z]{3}/.test(line)) return true;
  return /^(summary|professional summary|profile|about( me)?|objective|experience|work experience|professional experience|employment|education|skills|skills & tools|projects|personal projects|certifications|awards|publications|volunteering)$/i.test(line);
}

// A line naming an employer ("Acme Corp - Austin, TX") ends the bullets above it.
function isEmployerLine(line, organizations) {
  return !BULLET_START.test(line) && line.length < 80 && organizations.some((o) => o && flatten(line).startsWith(o));
}

// The resume line holding this role's (or entry's) title and dates; failing that, its dates, then
// its title. Each line is used once, so "UX Designer" doesn't land on "Senior UX Designer".
function findHeaderLine(lines, unit, used) {
  const title = unit.title ? flatten(unit.title) : null;
  const dates = unit.dates ? flatten(unit.dates) : null;
  const tries = [
    (l) => title && dates && l.includes(title) && l.includes(dates),
    (l) => dates && l.includes(dates),
    (l) => title && l.startsWith(title),
    (l) => title && l.includes(title),
  ];
  for (const test of tries) {
    const i = lines.findIndex((l, idx) => !used.has(idx) && !BULLET_START.test(l) && test(flatten(l)));
    if (i >= 0) {
      used.add(i);
      return i;
    }
  }
  return -1;
}

const BULLET_CHARS = "●•▪◦■‣∙·*";
const BULLET_START = new RegExp(`^([${BULLET_CHARS}]|[-–]\\s)`);

// Wrapped lines are joined back into one bullet: a bullet runs until the next bullet character.
// With no bullet characters at all, each line counts as one bullet.
function splitBullets(segment) {
  const nonEmpty = segment.filter(Boolean);
  if (!nonEmpty.some((l) => BULLET_START.test(l))) return nonEmpty;
  const bullets = [];
  for (const line of nonEmpty) {
    if (BULLET_START.test(line)) bullets.push(line.replace(BULLET_START, "").trim());
    else if (bullets.length) bullets[bullets.length - 1] += ` ${line}`;
  }
  return bullets;
}

function words(text) {
  return new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9.%+'-]*/g)?.filter((w) => w.length > 2 || /\d/.test(w)) ?? []);
}

// Dice similarity of word sets: 1 for the same words, 0 for none shared.
function similarity(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return (2 * shared) / (wa.size + wb.size);
}

// Below this, a draft bullet isn't treated as a version of an original one.
const MATCH_THRESHOLD = 0.35;

// Pairs each draft bullet with the original it came from (most similar pairs first, each
// original used once). Reworded: paired but not identical, or not paired at all (merged or
// rewritten beyond recognition). Removed: originals nothing was paired with. Reordered: the
// paired originals don't appear in their original order.
function compareBullets(original, draft) {
  const pairs = [];
  draft.forEach((d, di) => original.forEach((o, oi) => pairs.push({ di, oi, score: similarity(d, o) })));
  pairs.sort((a, b) => b.score - a.score);
  const draftTo = new Map();
  const usedOriginal = new Set();
  for (const p of pairs) {
    if (p.score < MATCH_THRESHOLD || draftTo.has(p.di) || usedOriginal.has(p.oi)) continue;
    draftTo.set(p.di, p.oi);
    usedOriginal.add(p.oi);
  }
  let reworded = 0;
  draft.forEach((d, di) => {
    const oi = draftTo.get(di);
    if (oi === undefined || flatten(d) !== flatten(original[oi])) reworded++;
  });
  const order = draft.map((_, di) => draftTo.get(di)).filter((oi) => oi !== undefined);
  const reordered = order.some((oi, i) => i > 0 && oi < order[i - 1]);
  return { reworded, removed: original.length - usedOriginal.size, reordered };
}

// The resume line where a section's content sits, for ordering sections. For skills and
// education it's the line most of the section's items are on, below the first heading: a skill
// like "Figma" or "Design Systems" also turns up in the headline and in bullets.
function anchorLine(block, lines, units, headings = []) {
  if (block.kind === "role" || block.kind === "other") {
    const found = units.filter((u) => u.block.section === block.section && u.line >= 0).map((u) => u.line);
    return found.length ? Math.min(...found) : -1;
  }
  const probes =
    block.kind === "education"
      ? block.entries.flatMap((e) => [e.degree, e.institution])
      : block.kind === "skills"
        ? block.groups.flatMap((g) => [g.label ? `${g.label}:` : null, ...g.items])
        : [];
  const from = headings.length ? headings[0] : 0;
  const counts = new Map();
  for (const p of probes.filter(Boolean)) {
    lines.forEach((l, i) => {
      if (i > from && flatten(l).includes(flatten(p))) counts.set(i, (counts.get(i) ?? 0) + 1);
    });
  }
  let best = -1;
  for (const [i, n] of counts) if (best < 0 || n > counts.get(best) || (n === counts.get(best) && i < best)) best = i;
  return best;
}

// The resume's skills, read from the lines under the heading above the first skill found:
// "Label: a, b, c" lines (wrapped lines joined back on), or plain comma lists.
function originalSkillGroups(skills, lines, headings) {
  const first = anchorLine(skills, lines, [], headings);
  if (first < 0) return null;
  const start = [...headings].reverse().find((i) => i <= first) ?? first - 1;
  const end = Math.min(...headings.filter((i) => i > start), lines.length);
  const joined = [];
  for (const line of lines.slice(start + 1, end).filter(Boolean)) {
    if (/^[^,:]{1,40}:/.test(line) || !joined.length) joined.push(line);
    else joined[joined.length - 1] += ` ${line}`;
  }
  return joined.map((l) => {
    const m = l.match(/^([^,:]{1,40}):\s*(.*)$/);
    return { label: m ? m[1].trim() : null, items: splitList(m ? m[2] : l) };
  });
}

// Splits on commas outside parentheses ("Accessibility (WCAG 2.1 AA, 2.2 AA)" stays whole).
function splitList(text) {
  const out = [];
  let depth = 0;
  let current = "";
  for (const c of text) {
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      out.push(current);
      current = "";
    } else current += c;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

function compareSkills(skills, lines, headings) {
  const groups = originalSkillGroups(skills, lines, headings);
  if (!groups) return [];
  const original = groups.flatMap((g, gi) => g.items.map((item, ii) => ({ item, key: flatten(item), gi, ii })));
  const byKey = new Map(original.map((o) => [o.key, o]));
  const items = [];

  let reworded = 0;
  const seen = new Set();
  const reorderedGroups = [];
  const draftGroupOrder = [];
  for (const g of skills.groups) {
    const positions = [];
    for (const item of g.items) {
      const o = byKey.get(flatten(item));
      if (!o) reworded++;
      else {
        seen.add(o.key);
        positions.push(o.gi * 10_000 + o.ii);
      }
    }
    if (positions.some((p, i) => i > 0 && p < positions[i - 1])) reorderedGroups.push(g.label ?? "Skills");
    if (positions.length) draftGroupOrder.push(Math.floor(Math.min(...positions) / 10_000));
  }
  const removed = original.filter((o) => !seen.has(o.key)).length;

  if (reorderedGroups.length) items.push(`Skills reordered in ${reorderedGroups.join(", ")}`);
  if (draftGroupOrder.some((g, i) => i > 0 && g < draftGroupOrder[i - 1])) items.push("Skill groups reordered");
  if (reworded) items.push(`${reworded} ${plural(reworded, "skill")} reworded or regrouped`);
  if (removed) items.push(`${removed} ${plural(removed, "skill")} removed`);
  return items;
}
