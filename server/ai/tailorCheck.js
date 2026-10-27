import { appearsIn, flatten, STRONG_CLAIMS } from "./scoreJob.js";

/**
 * Plain-code check run after a tailored draft is complete: does the draft contain anything the
 * original resume doesn't? Flags numbers and percentages, dates, company names, job titles and
 * degrees that are new, plus contact details, locations and entry names that weren't copied
 * exactly. The UI shows "Nothing added" only when verified is true.
 *
 * It's deliberately strict: a reworded date ("Oct 2021" for "October 2021") passes, but anything
 * it can't match in the resume is flagged for the person to look at rather than assumed fine.
 *
 * warnings are softer signals that don't affect verified: a verb stronger than the resume uses
 * ("led" where the resume never says it), and skills worded differently from the resume (allowed
 * when they mean the same thing, so worth a look but not a failure).
 */
export function checkTailoredDraft({ blocks, resumeText, knownCompanies = [] }) {
  const newItems = [];
  const warnings = [];
  const seen = new Set();
  const flag = (kind, value, where) => {
    const key = `${kind}|${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    newItems.push({ kind, value, where });
  };
  const mustAppear = (kind, value, where) => {
    if (value && !appearsIn(value, resumeText)) flag(kind, value, where);
  };

  const resumeMonths = new Set(monthYearsIn(resumeText));

  // Every piece of draft text with where it came from, for the free-text checks below.
  const pieces = [];
  for (const block of blocks) {
    const where = blockLabel(block);
    if (block.kind === "header") {
      mustAppear("contact", block.name, where);
      mustAppear("contact", block.headline, where);
      for (const line of block.contact ?? []) mustAppear("contact", line, where);
      pieces.push(...[block.name, block.headline, ...(block.contact ?? [])].map((text) => ({ text, where })));
    } else if (block.kind === "role") {
      mustAppear("title", block.title, where);
      mustAppear("company", block.organization, where);
      mustAppear("location", block.location, where);
      checkDates(block.dates, where);
      pieces.push(...[block.title, block.organization, block.location, block.dates, ...block.bullets].map((text) => ({ text, where })));
    } else if (block.kind === "education") {
      for (const e of block.entries) {
        mustAppear("degree", e.degree, where);
        mustAppear("company", e.institution, where);
        mustAppear("location", e.location, where);
        checkDates(e.dates, where);
        pieces.push(...[e.degree, e.institution, e.location, e.dates, ...e.details].map((text) => ({ text, where })));
      }
    } else if (block.kind === "other") {
      for (const e of block.entries) {
        mustAppear("entry", e.title, where);
        mustAppear("entry", e.subtitle, where);
        checkDates(e.dates, where);
        pieces.push(...[e.title, e.subtitle, e.dates, ...e.bullets].map((text) => ({ text, where })));
      }
    } else if (block.kind === "skills") {
      for (const g of block.groups) {
        for (const item of g.items) {
          if (!appearsIn(item, resumeText)) warnings.push(`Skill worded differently from the resume: "${item}" (${where})`);
        }
        pieces.push(...[g.label, ...g.items].map((text) => ({ text, where })));
      }
    } else if (block.kind === "summary") {
      pieces.push(...block.paragraphs.map((text) => ({ text, where })));
    }
  }

  function checkDates(dates, where) {
    if (!dates) return;
    for (const my of monthYearsIn(dates)) if (!resumeMonths.has(my)) flag("date", dates, where);
    if (/\b(present|current|now)\b/i.test(dates) && !/\b(present|current)\b/i.test(resumeText)) flag("date", dates, where);
  }

  flagNewFacts(pieces, { resumeText, knownCompanies, flag });

  // Verb strength, across the prose only (bullets, summary).
  const prose = blocks
    .flatMap((b) => (b.kind === "role" ? b.bullets : b.kind === "summary" ? b.paragraphs : b.kind === "other" ? b.entries.flatMap((e) => e.bullets) : []))
    .join("\n");
  warnings.push(...strongerVerbs(prose, resumeText));

  return { verified: newItems.length === 0, newItems, warnings };
}

/**
 * The same check for a cover letter (server/ai/writeCoverLetter.js), run on its body paragraphs
 * once the letter is complete. resumeText is the resume source the letter was written from.
 * Flags numbers and percentages, month-year dates, degrees, job-title phrases and company names
 * that aren't in that resume. A letter talks about the job too, so two things are allowed:
 * the target company's name, and title phrases the posting itself uses ("Product Managers",
 * the job's own title). Code can't tell "the Staff Product Designer role" from "as a Staff
 * Product Designer", so each posting title missing from the resume is listed in warnings to look
 * at, except phrases of the job's own title, which nearly every letter names. Numbers, dates and
 * degrees from the posting are still flagged: the letter's claims about
 * the person must come from the resume.
 * warnings also list stronger verbs than the resume uses (as for tailoring).
 */
export function checkCoverLetter({ paragraphs, resumeText, knownCompanies = [], company, jobTitle = "", postingText = "" }) {
  const warnings = [];
  const newItems = [];
  const seen = new Set();
  const flag = (kind, value, where) => {
    const key = `${kind}|${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    newItems.push({ kind, value, where });
  };
  const pieces = paragraphs.map((text, i) => ({ text, where: `Paragraph ${i + 1}` }));
  flagNewFacts(pieces, {
    resumeText,
    knownCompanies: knownCompanies.filter((name) => name.toLowerCase() !== company?.trim().toLowerCase()),
    flag,
    titleAllowed: (title, where) => {
      const fromPosting = appearsIn(title, postingText) || appearsIn(title.replace(/s$/, ""), postingText);
      if (fromPosting && !appearsIn(title, resumeText) && !appearsIn(title, jobTitle)) {
        warnings.push(`Title from the posting, not the resume: "${title}" (${where}); check it isn't claimed as the person's own`);
      }
      return fromPosting;
    },
  });
  warnings.push(...strongerVerbs(paragraphs.join("\n"), resumeText));
  return { verified: newItems.length === 0, newItems, warnings };
}

// The free-text checks shared by tailored drafts and cover letters: anything factual in `pieces`
// that the resume doesn't have is passed to flag(kind, value, where).
function flagNewFacts(pieces, { resumeText, knownCompanies, flag, titleAllowed = () => false }) {
  const resumeNumbers = numbersIn(resumeText);
  const resumeMonths = new Set(monthYearsIn(resumeText));
  const resumeDegreeTokens = new Set(degreeTokensIn(resumeText).map((d) => d.token));
  const resumeFlat = flatten(resumeText);

  for (const { text, where } of pieces) {
    if (!text) continue;

    for (const n of numbersIn(text)) {
      const ok = n.percent ? resumeNumbers.percents.has(n.value) : resumeNumbers.values.has(n.value);
      if (!ok) flag(n.percent ? "percentage" : "number", n.raw, where);
    }
    for (const w of numberWordsIn(text)) {
      if (!resumeNumbers.values.has(w.value) && !new RegExp(`\\b${w.raw}\\b`, "i").test(resumeText)) flag("number", w.raw, where);
    }
    for (const my of monthYearsIn(text)) {
      if (!resumeMonths.has(my)) flag("date", my[0].toUpperCase() + my.slice(1).replace("-", " "), where);
    }
    for (const d of degreeTokensIn(text)) {
      if (!resumeDegreeTokens.has(d.token)) flag("degree", d.raw, where);
      else if (d.field && !resumeFlat.includes(flatten(d.field))) flag("degree", `${d.raw} ${d.field}`.trim(), where);
    }
    for (const title of titlePhrasesIn(text)) {
      if (titleAllowed(title, where)) continue;
      if (!appearsIn(title, resumeText) && !appearsIn(title.replace(/s$/, ""), resumeText)) flag("title", title, where);
    }
    for (const name of knownCompanies) {
      if (mentions(text, name) && !new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(resumeText)) flag("company", name, where);
    }
  }
}

function strongerVerbs(prose, resumeText) {
  const warnings = [];
  for (const { word, resume } of STRONG_CLAIMS) {
    const used = prose.match(word);
    if (used && !resume.test(resumeText)) warnings.push(`Uses "${used[0]}", which the resume never does`);
  }
  return warnings;
}

function blockLabel(block) {
  if (block.kind === "header") return "Header";
  if (block.kind === "role") return `${block.section}: ${block.title}, ${block.organization}`;
  return block.section;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-sensitive whole-word match, so a company called "Medium" isn't found in "medium-sized".
function mentions(text, name) {
  return name.length >= 3 && new RegExp(`(^|[^\\w])${escapeRegExp(name)}(?![\\w])`).test(text);
}

const MULTIPLIERS = { k: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };

// Digits only. "120,000+" and "120K" both become 120000; "45%" is a percentage of 45. A
// percentage in the draft must be a percentage in the resume, and a plain number a plain number.
// Digits joined to letters ("B2B", "HTML5", "CSS3") are names, not figures, and are skipped.
function numbersIn(text) {
  const out = [];
  const re = /(?<![A-Za-z\d])(\d+(?:[.,]\d+)*)(?:\s*(%|percent\b|million\b|billion\b)|(k|m|b)\b)?(?![A-Za-z])/gi;
  for (const m of text.matchAll(re)) {
    const base = m[1].replace(/,(?=\d{3}\b)/g, "");
    const suffix = (m[2] ?? m[3])?.toLowerCase();
    const percent = suffix === "%" || suffix === "percent";
    const mult = !percent && suffix ? MULTIPLIERS[suffix] : 1;
    const value = mult === 1 ? String(Number(base)) : String(Number(base) * mult);
    out.push({ raw: m[0].trim(), value, percent });
  }
  // The sets are the lookups used when this runs on the resume.
  return Object.assign(out, {
    values: new Set(out.filter((n) => !n.percent).map((n) => n.value)),
    percents: new Set(out.filter((n) => n.percent).map((n) => n.value)),
  });
}

// Spelled-out counts ("three designers"). "one" is left out: it's too common in plain prose.
const NUMBER_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, hundred: 100, hundreds: 100, thousand: 1000, thousands: 1000, million: 1e6, millions: 1e6 };

function numberWordsIn(text) {
  const out = [];
  for (const m of text.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozens?|hundreds?|thousands?|millions?)\b/gi)) {
    const raw = m[1].toLowerCase();
    // "1 million" is already covered by the digit check.
    if (/\d\s*$/.test(text.slice(0, m.index))) continue;
    out.push({ raw, value: String(NUMBER_WORDS[raw.replace(/s$/, "")] ?? NUMBER_WORDS[raw]) });
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "October 2021", "Oct. 2021", "Sept 2021" all become "oct-2021".
function monthYearsIn(text) {
  const re = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+((?:19|20)\d{2})\b/gi;
  return [...text.matchAll(re)].map((m) => `${MONTHS.find((mon) => m[1].toLowerCase().startsWith(mon))}-${m[2]}`);
}

// Degree words and abbreviations, with the field of study when it's written out ("Bachelor of
// Engineering in Information Technology" → field "Engineering in Information Technology").
// Two-letter abbreviations only count with dots ("B.A."), since "MA" is also a US state.
const DEGREE_RE =
  /\b(Bachelor|Master|Doctorate|Doctor|Associate)(?:['’]s)?(?:\s+degree)?(?:\s+(?:of|in)\s+((?:[A-Z][\w&]*)(?:\s+(?:of|in|and|&|[A-Z][\w&]*))*))?|\b(Ph\.?\s?D\.?|MBA|BFA|MFA|BSc|MSc|B\.\s?S\.|M\.\s?S\.|B\.\s?A\.|M\.\s?A\.|B\.\s?E\.|M\.\s?E\.|B\.?\s?Tech|M\.?\s?Tech|B\.?\s?Des|M\.?\s?Des)(?![\w])/g;

function degreeTokensIn(text) {
  return [...text.matchAll(DEGREE_RE)].map((m) => {
    const raw = (m[1] ?? m[3]).trim();
    return { raw, token: raw.toLowerCase().replace(/[.\s'’]/g, "").replace(/s$/, ""), field: m[2] ?? null };
  });
}

const SENIORITY = new Set(["senior", "sr", "sr.", "lead", "principal", "staff", "junior", "jr", "jr.", "associate", "head", "chief", "founding", "group", "vice", "executive", "distinguished"]);
const ROLE_NOUNS = "Designer|Engineer|Manager|Analyst|Researcher|Developer|Architect|Consultant|Director|Lead|Strategist|Specialist|Scientist|Writer|Producer|Officer|President|Intern";

// Capitalized job-title phrases of two or more words ("Lead Product Designer", "Design Lead").
// Leading capitalized words that aren't titles ("Acme Science Product Designer") are trimmed off
// until a seniority word or the role itself is reached, so only the title part is checked.
function titlePhrasesIn(text) {
  const re = new RegExp(`((?:[A-Z][\\w/&+.-]*\\s+){1,4})(${ROLE_NOUNS})s?\\b`, "g");
  const out = [];
  for (const m of text.matchAll(re)) {
    const words = m[0].trim().split(/\s+/);
    let start = 0;
    while (start < words.length - 2 && !SENIORITY.has(words[start].toLowerCase()) && !isTitleModifier(words, start)) start++;
    const phrase = words.slice(start).join(" ");
    if (phrase.split(" ").length >= 2) out.push(phrase);
  }
  return out;
}

// Words that commonly sit right before the role noun in a title ("Product", "UX", "Visual"):
// once one is reached, everything from there on is the title.
function isTitleModifier(words, i) {
  return /^(product|ux|ui|ux\/ui|ui\/ux|visual|interaction|graphic|brand|content|software|frontend|front-end|backend|design|research|technical|program|project|engineering|data|marketing|growth|systems?)$/i.test(words[i]);
}
