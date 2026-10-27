# ApplyMate

ApplyMate is a local AI job search tool. It finds roles from company careers pages, scores each one against your resume, helps you tailor a resume and cover letter for the ones you want, and tracks your applications.

It is not an auto-apply tool. It never applies for you. You choose which jobs to open, which documents to generate, and when to mark something as applied.

Built and tested for product designers. Other roles should work but are untested. Version 1 is US-focused: it only looks at US jobs.

## What you need

- Node 22.13 or newer.
- An Anthropic API key. API usage is billed separately from any Claude subscription, so set a spend limit in the Anthropic Console before you start.
- Logo.dev keys, one secret and one publishable, both free. The secret key (`LOGO_DEV_SECRET_KEY`) is for company search: without it you can't add companies by search, and the app says so. The publishable key (`VITE_LOGO_DEV_PUBLISHABLE_KEY`) is for company logos: without it, initials show instead. The free plan needs a visible link back to Logo.dev for commercial projects and does not need one for personal projects. I checked the current terms at https://www.logo.dev/docs/platform/attribution; check them again before you rely on this.
- Chrome or Edge, required for PDF download. ApplyMate drives a browser you already have installed and downloads none. If it can't find yours, set `CHROME_PATH`.

## Setup

```bash
git clone https://github.com/YashadaGhag/applymate.git
cd applymate
npm install
cp .env.example .env
```

On Windows PowerShell, copy the file with:

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in the three required keys. `.env.example` explains each variable and what happens without it. Then start the app:

```bash
npm run dev:all
```

This runs the Vite client and the API together. Open http://localhost:5173.

The API listens on port 3001 by default. If you change `PORT`, change the proxy target in `vite.config.js` to match.

## What it costs

These figures come from one real run with one resume and designer jobs. It is a small sample, and cost varies with the length of your resume and of each job description.

- Scoring a job: about $0.017 (measured $0.014 to $0.021 over 44 jobs).
- Preparing an application: about $0.05, made up of about $0.036 for the resume and about $0.015 for the cover letter (from three resumes and one letter).
- That whole run scored 44 jobs and prepared 3 resumes and 1 letter, and cost $0.86 in total.

A scoring run is capped at 150 calls, so about $2.50 at most. Scores are cached, so a job that already has a current score is not charged again.

## Daily updates

While the app is running, it checks for new roles once a day, after 9 AM Pacific, and scores the new ones. It only runs while the app is open: a day the app is closed is caught up the next time you start it. Setting `APPLYMATE_SCHEDULER=off` turns off all background work, including the background check after you add companies to your watchlist.

## Which companies it can check

ApplyMate reads careers pages from a fixed set of supported systems. At the moment those are Greenhouse, Lever and Ashby. The command below prints the current list, generated from the code:

```bash
npm run list:sources
```

It prints each supported source with its id and name. Companies that use another system can't be checked yet. They show in a "can't check yet" notice on the Company Watchlist tab and stay on your list. A good share of well-known companies may be unsupported: in my own test, about half of 19 were. A company with its own custom careers site may not be fetchable at all.

The designation suggestions on the Role page lean toward tech roles, because the starter list is generated from the careers pages of tech companies. You can always type your own.

## Privacy and safety

- It runs locally. The server listens only on 127.0.0.1.
- There is no login. Don't expose it to a network.
- Your data lives in the `data/` folder as plain JSON files, including your resume text. The folder is git-ignored.
- Your resume text and job descriptions are sent to the Anthropic API for resume reading, scoring, tailoring and cover letters.
- Job listings come from the public job-board endpoints of Greenhouse, Lever and Ashby. You are responsible for following those services' terms.

## Development

```bash
node --test
npm run lint
npm run storybook
```

Folders:

- `src/`: the React client (pages, components, hooks, design tokens).
- `server/`: the Express API, scraper, AI calls, scheduler and PDF generation.
- `shared/`: code imported by both the client and the server.

## Contributing

Issues are welcome. I'm not accepting pull requests for now.

## License

MIT. See [LICENSE](LICENSE).

Author: Yashada Ghag, [yashadaportfolio.vercel.app](https://yashadaportfolio.vercel.app)
