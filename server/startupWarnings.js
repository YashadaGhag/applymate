// One line per missing secret key, printed at startup: what stops working, and how to fix it.
const KEYS = [
  {
    name: "LOGO_DEV_SECRET_KEY",
    effect: "company search is off, so companies can't be added by search",
  },
  {
    name: "ANTHROPIC_API_KEY",
    effect: "resume reading, scoring, tailoring and cover letters won't work",
  },
];

/** The warning lines for the keys missing from `env` (an empty or whitespace-only value counts as missing). */
export function missingKeyWarnings(env = process.env) {
  return KEYS.filter(({ name }) => !env[name]?.trim()).map(
    ({ name, effect }) => `[setup] ${name} is not set: ${effect}. Add it to .env and restart the app.`,
  );
}
