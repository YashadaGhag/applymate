import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, Pencil, X } from "lucide-react";
import MainLayout from "../components/MainLayout";
import Button from "../components/Button/Button";
import Banner from "../components/Banner/Banner";
import MatchScore from "../components/MatchScore/MatchScore";
import CompanyLogo from "../components/JobCard/CompanyLogo";
import DotsLoader from "../components/DotsLoader";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import Modal from "../components/Modal/Modal";
import SecondaryTabBar from "../components/SecondaryTabBar";
import { useJob } from "../hooks/useJob";
import { useTailoring } from "../hooks/useTailoring";
import { useCoverLetter } from "../hooks/useCoverLetter";
import { useWritingStyle } from "../hooks/useWritingStyle";
import { useProfile } from "../hooks/useProfile";
import { useListReturn } from "../hooks/useListReturn";
import { useApplyNow } from "../hooks/useApplication";
import { useEditedDocument } from "../hooks/useEditedDocument";
import { useJobActions } from "../context/JobActionsContext";
import { openDocumentLink } from "../utils/openDocumentLink.js";
import { EditorToolbar, PagedResumeEditor, ResumePrint, printResume, useResumeEditor } from "../components/ResumeEditor";
import {
  RESUME_DOCUMENT_CLASSES,
  blockToHtml,
  draftToHtml,
  letterBlockToHtml,
  letterToHtml,
  sectionHeadingHtml,
} from "../../shared/resumeHtml.js";
import documentIcon from "../assets/resume-assistant/document.svg";
import orbGlow from "../assets/resume-assistant/orb-glow.svg";
import orbHalo from "../assets/resume-assistant/orb-halo.svg";
import orbCore from "../assets/resume-assistant/orb-core.svg";
import aiSymbol from "../assets/resume-assistant/ai-symbol.png";
import stepDoneIcon from "../assets/resume-assistant/step-done.svg";
import stepCurrentIcon from "../assets/resume-assistant/step-current.svg";


// A saved draft or job that loads faster than this shows with no loader at all.
const LOADER_DELAY_MS = 300;

const TABS = [
  { key: "resume", label: "Resume" },
  { key: "cover-letter", label: "Cover Letter" },
];

const FADE_IN = "animate-fade-in motion-reduce:animate-none";

// Editing and Export PDF are desktop only (Tailwind's md); mobile stays read-only.
const DESKTOP_QUERY = "(min-width: 48rem)";

function subscribeToDesktop(onChange) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isDesktopNow() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function useIsDesktop() {
  return useSyncExternalStore(subscribeToDesktop, isDesktopNow);
}

// ─── Progress ────────────────────────────────────────────────────────────────
// The bar moves only on stream events: a share when reading ends (the first section or paragraph
// starts), an equal share per finished section or paragraph out of the plan's count, and the last
// share when the "nothing added" check is done. Each part only grows, so the bar never moves
// backwards.
const READING_SHARE = 15;
const DRAFTING_SHARE = 70;
const CHECK_SHARE = 15;

function sharedProgress({ phase, readingDone, finished, planned, draftingDone, checked }) {
  if (phase === "done") return 100;
  let pct = 0;
  if (readingDone) pct += READING_SHARE;
  if (draftingDone) pct += DRAFTING_SHARE;
  else if (planned > 0) pct += DRAFTING_SHARE * Math.min(1, finished / planned);
  if (checked) pct += CHECK_SHARE;
  return Math.round(pct);
}

function resumeProgress(t) {
  return sharedProgress({
    phase: t.phase,
    readingDone: t.sectionsStarted,
    finished: t.blocks.filter(Boolean).length,
    planned: t.plan?.length ?? 0,
    draftingDone: t.blocksDone,
    checked: t.checked,
  });
}

function letterParagraphCount(blocks) {
  return blocks.filter((b) => b?.kind === "paragraph").length;
}

function letterProgress(c) {
  return sharedProgress({
    phase: c.phase,
    readingDone: c.paragraphsStarted,
    finished: letterParagraphCount(c.blocks),
    planned: c.plan?.paragraphs ?? 0,
    draftingDone: c.blocksDone,
    checked: c.checked,
  });
}

// Resume: 1 Understand (click → first section starts), 2 Draft (sections streaming),
// 3 Check against the job (gaps + "nothing added" check), 4 Ready.
function resumeStep(t) {
  if (t.phase === "done") return 4;
  if (t.blocksDone) return 3;
  if (t.sectionsStarted) return 2;
  return 1;
}

// Cover letter: 1 Understand the role (click → first paragraph starts), 2 Draft (paragraphs
// streaming), 3 Check against your resume ("nothing added" check), 4 Ready.
function letterStep(c) {
  if (c.phase === "done") return 4;
  if (c.blocksDone) return 3;
  if (c.paragraphsStarted) return 2;
  return 1;
}

// Figma copy, changed where it claimed something the system doesn't do (see the report).
const RESUME_STEP_COPY = {
  1: {
    headline: "Getting to know your experience",
    body: "We're reading your resume and the job posting.",
  },
  2: {
    headline: "Your story is taking shape",
    body: "We're writing each section for this job from what's already in your resume.",
  },
  3: {
    headline: "Checking against the job",
    body: "We're noting what the job asks for that your resume doesn't show, and confirming the draft was written using only what's in your resume.",
  },
  4: {
    headline: "Ready for your finishing touch",
    body: "Your resume is ready. Review the wording, make it yours, then export when you're happy.",
    // Mobile is read-only: no editor or Export PDF there.
    bodyMobile: "Your resume is ready. Review the wording, then open it on desktop to edit and export.",
  },
};

const RESUME_STEPS = [
  { title: "Understand your experience", doneText: () => "Resume and job posting read" },
  { title: "Draft your resume", doneText: (n) => `${n} ${n === 1 ? "section" : "sections"} drafted` },
  { title: "Check against the job", doneText: () => "Gaps listed, draft checked" },
  { title: "Ready to review", doneText: () => "Your review comes next" },
];

// Step 2 is Figma's ("Your letter is taking shape"); the others follow it (no Figma frame), and
// step 3 is "Check against your resume" in place of Figma's "Refine the tone", which the system
// doesn't do.
function letterStepCopy(company) {
  return {
    1: {
      headline: "Getting to know the role",
      body: "We're reading the job posting and your resume, and choosing what to highlight.",
    },
    2: {
      headline: "Your letter is taking shape",
      body: company
        ? `We're connecting your experience to ${company}'s role, one paragraph at a time.`
        : "We're connecting your experience to this role, one paragraph at a time.",
    },
    3: {
      headline: "Checking against your resume",
      body: "We're confirming the letter only uses what's in your resume.",
    },
    4: {
      headline: "Ready for your finishing touch",
      body: "Your cover letter is ready. Review the wording, make it yours, then export when you're happy.",
      bodyMobile: "Your cover letter is ready. Review the wording, then open it on desktop to edit and export.",
    },
  };
}

const LETTER_STEPS = [
  { title: "Understand the role", doneText: () => "Job posting and resume read" },
  { title: "Draft your cover letter", doneText: (n) => `${n} ${n === 1 ? "paragraph" : "paragraphs"} drafted` },
  { title: "Check against your resume", doneText: () => "Letter checked" },
  { title: "Ready to review", doneText: () => "Your review comes next" },
];

function useDelayedFlag(active, delay) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setShown(true), delay);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [active, delay]);
  return active && shown;
}

// ─── Header ──────────────────────────────────────────────────────────────────

// `action`: the Apply button at the right of the row (Figma 2623:10822), when the page has a job.
// Below md (Figma mobile 2618:40171) the button sits on its own row under the titles, 24 apart.
function TitleRow({ jobId, action = null }) {
  const back = useListReturn();
  return (
    <div className="flex flex-col items-start gap-sp24 md:flex-row md:justify-between md:gap-sp16">
    <div className="flex flex-col gap-sp24 md:gap-sp4">
      {/* Helper-text color (InputField's help text). The links set it themselves: the global link
          color in src/index.css would otherwise win. */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-sp8 text-body-small text-neutral-500">
        <Link to={back.to} state={back.state} className="text-neutral-500 hover:text-neutral-500 hover:underline">
          {back.label}
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/jobs/${encodeURIComponent(jobId)}`} className="text-neutral-500 hover:text-neutral-500 hover:underline">
          Job Details
        </Link>
      </nav>
      <h1 className="m-0 text-h5 font-medium text-neutral-800">Customize Application</h1>
    </div>
    {action}
    </div>
  );
}

// ─── Side panel ──────────────────────────────────────────────────────────────

function PanelCard({ children, className = "" }) {
  return (
    <div className={`flex w-full flex-col rounded-sm border border-neutral-100 bg-white p-sp16 ${className}`}>
      {children}
    </div>
  );
}

function TailoredFor({ job }) {
  return (
    <PanelCard className="gap-sp12">
      <span className="text-body-small font-medium uppercase tracking-wider text-neutral-500">Tailored for</span>
      <div className="flex items-center justify-between gap-sp8">
        <div className="flex min-w-0 items-center gap-sp8">
          <CompanyLogo company={job.company.name} companyDomain={job.company.domain} />
          <span className="truncate text-body-large font-medium text-neutral-700">{job.company.name}</span>
        </div>
        {/* The job's existing score; tailoring never rescores. No ring without a current score. */}
        {job.ai && <MatchScore percentage={job.ai.score} band={job.ai.band} />}
      </div>
      <span className="text-body-medium font-medium text-neutral-800">{job.title}</span>
    </PanelCard>
  );
}

// The AI icon on its blue orb. The glow pulses and the icon breathes while a call runs; static at
// Ready and under prefers-reduced-motion.
function AssistantOrb({ running }) {
  const pulse = running ? "animate-soft-pulse motion-reduce:animate-none" : "";
  const breathe = running ? "animate-breathe motion-reduce:animate-none" : "";
  return (
    <div className="grid place-items-center" aria-hidden="true">
      <img src={orbGlow} alt="" className={`col-start-1 row-start-1 ${pulse}`} />
      <img src={orbHalo} alt="" className="col-start-1 row-start-1" />
      <div className={`col-start-1 row-start-1 grid place-items-center ${breathe}`}>
        <img src={orbCore} alt="" className="col-start-1 row-start-1" />
        <img src={aiSymbol} alt="" width="20" height="20" className="col-start-1 row-start-1" />
      </div>
    </div>
  );
}

function StepMarker({ state, number }) {
  if (state === "done") return <img src={stepDoneIcon} alt="" className="shrink-0" />;
  if (state === "current") {
    return <img src={stepCurrentIcon} alt="" className="shrink-0 animate-soft-pulse motion-reduce:animate-none" />;
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-lg bg-neutral-100 text-body-small text-neutral-500">
      {number}
    </span>
  );
}

function Checklist({ steps, step, doneCount }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-sp16 p-0">
      {steps.map((s, i) => {
        const number = i + 1;
        const state = number < step ? "done" : number === step ? "current" : "pending";
        return (
          <li key={s.title} className="flex items-start gap-sp8" aria-current={state === "current" ? "step" : undefined}>
            <StepMarker state={state} number={number} />
            <div className="flex min-w-0 flex-col">
              <span className={`text-body-medium ${state === "pending" ? "text-neutral-500" : "text-neutral-700"}`}>
                {s.title}
              </span>
              {state === "current" && <span className="text-body-small text-primary-500">In progress</span>}
              {state === "done" && <span className="text-body-small text-neutral-500">{s.doneText(doneCount)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const KIND_LABELS = {
  number: "number",
  percentage: "percentage",
  date: "date",
  company: "company",
  title: "job title",
  degree: "degree",
  contact: "contact detail",
  location: "location",
  entry: "entry",
};

// The "nothing added" tick only when the check verified; otherwise the flagged items.
// `against`: what the document was checked against ("your base resume", "your resume").
function CheckLine({ check, against }) {
  if (!check) return null;
  return check.verified ? (
    <div className="flex items-start gap-sp8">
      <Check size={24} className="shrink-0 text-neutral-800" aria-hidden="true" />
      <span className="flex-1 text-body-small text-neutral-700">Nothing added that isn&apos;t in {against}</span>
    </div>
  ) : (
    <div className="flex items-start gap-sp8">
      <AlertTriangle size={24} className="shrink-0 text-warning-500" aria-hidden="true" />
      <span className="flex-1 text-body-small text-neutral-700">
        Not found in {against}, check before using:{" "}
        {check.newItems.map((i) => `${KIND_LABELS[i.kind] ?? i.kind} "${i.value}" (${i.where})`).join("; ")}
      </span>
    </div>
  );
}

function BulletLine({ children }) {
  return (
    <div className="flex items-start gap-sp8 text-body-small text-neutral-700">
      <span aria-hidden="true">•</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

// Code-generated What changed, then the check.
function WhatChanged({ changes, check }) {
  return (
    <div className="flex flex-col gap-sp12">
      <span className="text-body-medium font-medium text-neutral-800">What changed</span>
      {changes.length === 0 ? (
        <p className="m-0 text-body-small text-neutral-700">No edits from your base resume.</p>
      ) : (
        changes.map((item) => <BulletLine key={item}>{item}</BulletLine>)
      )}
      <CheckLine check={check} against="your base resume" />
    </div>
  );
}

// The resume the letter was (or will be) written from, as the person knows it. "editor" is the
// Resume tab's text, only ever sent when that tab has a tailored draft.
function resumeSourceLabel(source) {
  return source === "base" ? "Your resume" : "Your tailored resume for this role";
}

// What the saved letter was written from (the letter's own record, not the current settings),
// then the check.
function GeneratedFrom({ letter }) {
  const styleUsed = letter.styleUsed?.tone || letter.styleUsed?.letterSummary;
  const achievements = letter.achievements ?? [];
  return (
    <div className="flex flex-col gap-sp12">
      <span className="text-body-medium font-medium text-neutral-800">Generated from</span>
      <BulletLine>This job&apos;s description</BulletLine>
      <BulletLine>{resumeSourceLabel(letter.resumeSource)}</BulletLine>
      {styleUsed && <BulletLine>Your writing style</BulletLine>}
      {achievements.length > 0 && (
        <BulletLine>
          Achievements it highlights:
          <ul className="m-0 mt-sp4 flex list-none flex-col gap-sp4 p-0">
            {achievements.map((a) => (
              <li key={a} className="text-neutral-500">
                {a}
              </li>
            ))}
          </ul>
        </BulletLine>
      )}
      <CheckLine check={letter.check} against="your resume" />
    </div>
  );
}

/**
 * The Resume / Cover Letter Assistant: step copy, progress and the step list while a call runs;
 * at Ready the step list is replaced by `readyContent`. A document opened later (not live) goes
 * straight to Ready with no step animation.
 */
function Assistant({ title, phase, live, step, copy, steps, doneCount, percent, runningLabel, readyLabel, readyContent }) {
  const ready = phase === "done";
  const animate = !ready || live;
  const stepCopy = copy[step];

  return (
    <PanelCard className="gap-sp16">
      <div className="flex items-center justify-between gap-sp8 text-body-small">
        <span className="font-medium uppercase tracking-wider text-primary-500">{title}</span>
        <span className="text-neutral-500">{ready ? "Complete" : `Step ${step} of 4`}</span>
      </div>

      <div className="flex flex-col items-center gap-sp12 text-center">
        <AssistantOrb running={!ready} />
        {/* Keyed by step so each step's copy eases in when the step changes. */}
        <div key={step} className={`flex flex-col gap-sp12 ${animate ? FADE_IN : ""}`} aria-live="polite">
          <p className="m-0 text-body-large font-medium text-neutral-700">{stepCopy.headline}</p>
          <p className="m-0 text-body-medium text-neutral-500">
            {stepCopy.bodyMobile ? (
              <>
                <span className="md:hidden">{stepCopy.bodyMobile}</span>
                <span className="hidden md:inline">{stepCopy.body}</span>
              </>
            ) : (
              stepCopy.body
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-sp8">
        <div className="flex items-center justify-between gap-sp8 text-body-small">
          <span className="text-neutral-500">{ready ? readyLabel : runningLabel}</span>
          <span className="font-medium tracking-wider text-primary-500">{percent}%</span>
        </div>
        <ProgressBar percent={percent} />
      </div>

      {ready ? (
        <div className={animate ? FADE_IN : ""}>{readyContent}</div>
      ) : (
        <Checklist steps={steps} step={step} doneCount={doneCount} />
      )}
    </PanelCard>
  );
}

function ResumeAssistant({ tailoring }) {
  return (
    <Assistant
      title="Resume assistant"
      phase={tailoring.phase}
      live={tailoring.live}
      step={resumeStep(tailoring)}
      copy={RESUME_STEP_COPY}
      steps={RESUME_STEPS}
      doneCount={tailoring.blocks.filter(Boolean).length}
      percent={resumeProgress(tailoring)}
      runningLabel="Building your resume"
      readyLabel="Resume complete"
      readyContent={<WhatChanged changes={tailoring.changes ?? []} check={tailoring.check} />}
    />
  );
}

function CoverLetterAssistant({ cover, company }) {
  return (
    <Assistant
      title="Cover letter assistant"
      phase={cover.phase}
      live={cover.live}
      step={letterStep(cover)}
      copy={letterStepCopy(company)}
      steps={LETTER_STEPS}
      doneCount={letterParagraphCount(cover.blocks)}
      percent={letterProgress(cover)}
      runningLabel="Drafting your letter"
      readyLabel="Cover letter complete"
      readyContent={cover.letter && <GeneratedFrom letter={cover.letter} />}
    />
  );
}

// Before a letter is generated (Figma "Will use"): what the letter will be written from right now.
// onSetStyle opens Change Preferences in a new browser tab (leaving would discard edits).
function WillUse({ hasTailoredDraft, style, onSetStyle }) {
  return (
    <PanelCard className="gap-sp12">
      <span className="text-body-medium font-medium text-neutral-800">Will use</span>
      <div className="flex flex-col gap-sp24">
        <div className="flex flex-col gap-sp12">
          <BulletLine>This job&apos;s description</BulletLine>
          <BulletLine>{resumeSourceLabel(hasTailoredDraft ? "editor" : "base")}</BulletLine>
          {/* Hidden until the writing style has loaded (or if it couldn't be read), so the line
              never claims "not set" for a style that is. */}
          {style.status === "ready" &&
            (style.isSet ? (
              <div className="flex items-center gap-sp4 text-body-small text-neutral-700">
                <Check size={18} className="shrink-0 text-neutral-800" aria-hidden="true" />
                <span className="min-w-0 flex-1">Your writing style</span>
              </div>
            ) : (
              <div className="flex items-center gap-sp4 text-body-small text-neutral-500">
                <X size={18} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">Writing style: not set yet</span>
              </div>
            ))}
        </div>
        {style.status === "ready" && !style.isSet && (
          <Button variant="link" iconPosition="right" icon={<ArrowRight size={18} />} onClick={onSetStyle} className="self-start">
            Set your writing style
          </Button>
        )}
      </div>
    </PanelCard>
  );
}

// Before a resume is generated (Figma "Resume - Blank"): what it will be written from.
function ResumeWillUse() {
  return (
    <PanelCard className="gap-sp12">
      <span className="text-body-medium font-medium text-neutral-800">Will use</span>
      <div className="flex flex-col gap-sp12">
        <BulletLine>This job&apos;s description</BulletLine>
        <BulletLine>Your original resume for this role</BulletLine>
      </div>
    </PanelCard>
  );
}

function GapToReview({ gaps, animate }) {
  return (
    <div className={`flex w-full flex-col gap-sp8 rounded-sm border border-warning-50 bg-warning-50 p-sp16 ${animate ? FADE_IN : ""}`}>
      <span className="text-body-medium font-medium text-warning-800">Gap to review</span>
      {gaps.map((gap) => (
        <p key={gap.requirement} className="m-0 text-body-small text-neutral-700">
          {gap.text} If you have it, add it yourself.
        </p>
      ))}
    </div>
  );
}

// ─── Document ────────────────────────────────────────────────────────────────

// Skeleton lines per kind of section, in the Figma proportions.
const SKELETON_LINES = {
  header: ["w-1/2", "w-2/3", "w-3/4"],
  summary: ["w-full", "w-full", "w-3/4"],
  role: ["w-2/3", "w-full", "w-11/12", "w-3/5"],
  other: ["w-2/3", "w-full", "w-3/4"],
  skills: ["w-full", "w-4/5"],
  education: ["w-5/6"],
  greeting: ["w-1/3"],
  paragraph: ["w-full", "w-full", "w-11/12", "w-3/4"],
  signoff: ["w-1/4", "w-1/3"],
};
// Before the plan arrives (the model is still reading), a generic page of lines with no headings.
const GENERIC_SKELETON = [SKELETON_LINES.header, SKELETON_LINES.summary, SKELETON_LINES.role, SKELETON_LINES.skills];
// A letter's body before its plan arrives: the usual 3 paragraphs (the prompt asks for 3 or 4).
const GENERIC_LETTER_PARAGRAPHS = 3;

function SkeletonLines({ lines }) {
  return (
    <div className="flex flex-col gap-sp8 py-sp4" aria-hidden="true">
      {lines.map((width, i) => (
        <div key={i} className={`h-sp8 rounded-xs bg-neutral-200 ${width}`} />
      ))}
    </div>
  );
}

// A slot not written yet: the light blue highlight while it's being written, faded until then.
function PendingSlot({ current, lines, marker = null }) {
  return (
    <div
      className={`-mx-sp4 rounded-xs px-sp4 transition-colors duration-300 ease-in-out motion-reduce:transition-none ${
        current ? "bg-card-blue" : "opacity-60"
      }`}
    >
      {current && marker}
      <SkeletonLines lines={lines} />
    </div>
  );
}

// While tailoring runs: one slot per planned section, in order. A finished section replaces its
// skeleton; the section being written has the light blue highlight (Figma "Refining").
function StreamingDocument({ plan, blocks, currentIndex }) {
  if (!plan) {
    return (
      <div className="flex flex-col gap-sp24">
        {GENERIC_SKELETON.map((lines, i) => (
          <SkeletonLines key={i} lines={lines} />
        ))}
      </div>
    );
  }
  const count = Math.max(plan.length, blocks.length);
  const items = Array.from({ length: count }, (_, i) => ({ planned: plan[i], block: blocks[i] }));

  return (
    <div className={RESUME_DOCUMENT_CLASSES}>
      {items.map(({ planned, block }, i) => {
        const kind = block?.kind ?? planned?.kind;
        const section = block?.section ?? planned?.section;
        const prev = items[i - 1];
        const prevSection = prev?.block?.section ?? prev?.planned?.section;
        const heading = kind !== "header" && section && section !== prevSection ? sectionHeadingHtml(section) : "";

        if (block) {
          // draftToHtml escapes every piece of text; the only markup is its own fixed tags.
          return <div key={i} className={FADE_IN} dangerouslySetInnerHTML={{ __html: heading + blockToHtml(block) }} />;
        }
        return (
          <div key={i}>
            {heading && <div dangerouslySetInnerHTML={{ __html: heading }} />}
            <PendingSlot current={currentIndex === i} lines={SKELETON_LINES[kind] ?? SKELETON_LINES.other} />
          </div>
        );
      })}
    </div>
  );
}

// Figma's inline marker on the paragraph being written. The paragraph's text only appears once
// it's complete, so the marker sits on its skeleton.
function DraftingMarker() {
  return (
    <div className="flex items-center gap-sp4 pt-sp4 text-body-small text-primary-500">
      <span className="h-sp12 border-l-2 border-primary-500 animate-soft-pulse motion-reduce:animate-none" aria-hidden="true" />
      Drafting…
    </div>
  );
}

// While the letter is written: header and greeting (code) at once, one slot per planned body
// paragraph (each replaced by its text once complete), then the sign-off (code) once sent.
function LetterStreamingDocument({ plan, blocks, currentIndex, currentKind }) {
  const header = blocks[0];
  const greeting = blocks[1];
  const signoff = blocks.find((b) => b?.kind === "signoff");
  // Paragraphs are blocks 2…; size the slots from the plan, or from what's arrived if it's more.
  const lastParagraphIndex = Math.max(
    1,
    ...blocks.map((b, i) => (b?.kind === "paragraph" ? i : 1)),
    currentKind === "paragraph" ? currentIndex : 1
  );
  const slots = Math.max(plan?.paragraphs ?? GENERIC_LETTER_PARAGRAPHS, lastParagraphIndex - 1);

  const done = (block) => (
    // letterBlockToHtml escapes every piece of text; the only markup is its own fixed tags.
    <div className={FADE_IN} dangerouslySetInnerHTML={{ __html: letterBlockToHtml(block) }} />
  );

  return (
    <div className={RESUME_DOCUMENT_CLASSES}>
      {header ? done(header) : <PendingSlot current={false} lines={SKELETON_LINES.header} />}
      {greeting ? done(greeting) : <PendingSlot current={false} lines={SKELETON_LINES.greeting} />}
      {Array.from({ length: slots }, (_, p) => {
        const index = 2 + p;
        const block = blocks[index];
        if (block?.kind === "paragraph") return <div key={index}>{done(block)}</div>;
        return (
          <div key={index} className="mb-sp16">
            <PendingSlot current={currentIndex === index} lines={SKELETON_LINES.paragraph} marker={<DraftingMarker />} />
          </div>
        );
      })}
      {signoff ? done(signoff) : <PendingSlot current={false} lines={SKELETON_LINES.signoff} />}
    </div>
  );
}

// No Figma state for these: simplest option, a line of text and one button in the document's place.
function Placeholder({ children }) {
  return <div className="flex w-full flex-col items-center gap-sp16 px-sp16 py-sp80 text-center">{children}</div>;
}

// The document card: title bar (name, document, page count, then the buttons for the state), the
// formatting toolbar, the document. Buttons by `mode`:
//   "none"  idle, generating, error, or mobile: Export PDF only, disabled (no onExport)
//   "view"  Ready: Edit (pencil) and Export PDF
//   "edit"  Cancel (X) and Save (check); Export PDF disabled
// Edit, Cancel, Save and Export PDF are desktop only (md and up): below it the page is read-only.
// `paged`: the children draw their own sheets (the desktop editor), so there's no white document
// box around them.
function DocumentCard({ name, label, pageCount, toolbar, onExport, mode = "none", saving = false, onEdit, onCancel, onSave, paged = false, children }) {
  const title = [name, label, pageCount ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-sm border border-neutral-100 bg-card-neutral">
      <div className="flex flex-wrap items-center justify-between gap-sp16 rounded-t-sm border-b border-neutral-100 bg-white px-sp16 py-sp8">
        <div className="flex min-w-0 items-center gap-sp8">
          <img src={documentIcon} alt="" className="shrink-0" />
          <span className="truncate text-body-medium font-medium text-neutral-800">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-sp16">
          {mode === "view" && (
            <Button variant="link" iconPosition="left" icon={<Pencil size={18} />} onClick={onEdit} className="hidden md:inline-flex">
              Edit
            </Button>
          )}
          {mode === "edit" && (
            <>
              <Button variant="link" iconPosition="left" icon={<X size={18} />} disabled={saving} onClick={onCancel} className="hidden md:inline-flex">
                Cancel
              </Button>
              <Button variant="link" iconPosition="left" icon={<Check size={18} />} loading={saving} onClick={onSave} className="hidden md:inline-flex">
                Save
              </Button>
            </>
          )}
          <Button variant="primary" disabled={!onExport} onClick={onExport} className="hidden md:inline-flex">
            Export PDF
          </Button>
        </div>
      </div>
      {toolbar}
      {paged ? (
        // The sheets scale down to fit this column (PagedResumeEditor), so nothing scrolls sideways.
        <div className="p-sp16">{children}</div>
      ) : (
        <div className="p-sp16">
          <div className="border border-neutral-100 bg-white px-sp16 py-sp40 md:p-sp40">{children}</div>
        </div>
      )}
    </div>
  );
}

// View mode's guard: the text can be selected and copied (mouse, Ctrl/Cmd+C, and Ctrl/Cmd+A scoped to
// the document), but nothing can change it. The editor itself is `editable: false`, which makes
// ProseMirror ignore typing, paste, cut, drop and shortcuts; these handlers also stop the browser's
// own paste, cut and drag and drop. The wrapper takes focus on click (tabIndex -1, never a tab stop)
// so select all works, and shows no focus ring.
function ReadOnlyDocument({ children }) {
  const ref = useRef(null);
  const stop = (e) => e.preventDefault();
  const selectAll = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "a") return;
    const doc = ref.current?.querySelector(".ProseMirror");
    if (!doc) return;
    e.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(doc);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="outline-none [&_a]:cursor-pointer"
      onKeyDown={selectAll}
      // A link opens in a new tab (clicking never enters edit mode).
      onClick={openDocumentLink}
      onPaste={stop}
      onCut={stop}
      onDrop={stop}
      onDragStart={stop}
      onDragOver={stop}
    >
      {children}
    </div>
  );
}

// Desktop at Ready. View mode: the saved edit (else the generated draft) in a read-only editor whose
// text can be selected and copied, the toolbar visible but disabled, Edit and Export PDF. Edit mode: the
// same document editable (loading the tab's unsaved edits if it has any), the live toolbar, Cancel
// and Save, Export PDF disabled. Mounted afresh when the tab, the mode or the saved version changes
// (the page keys it), so each mode loads the right HTML.
function EditableDocumentCard({ name, label, company, viewHtml, editing, initialHtml, hasBaseline, onBaseline, onDraft, onEdit, onCancel, onSave, saving }) {
  const editor = useResumeEditor({
    html: editing ? initialHtml : viewHtml,
    editable: editing,
    onUpdate: onDraft,
    label: label === "Resume" ? "Tailored resume" : label,
  });
  const [pageCount, setPageCount] = useState(null);
  const fileName = [name, label, company].filter(Boolean).join(" - ");

  // The editor's own first serialization of the document is the baseline "no changes" is judged
  // against (it can differ from the generated HTML in whitespace), taken once per edit session.
  useEffect(() => {
    if (editing && editor && !hasBaseline) onBaseline(editor.getHTML());
  }, [editing, editor, hasBaseline, onBaseline]);

  return (
    <>
      <DocumentCard
        name={name}
        label={label}
        pageCount={pageCount}
        toolbar={<EditorToolbar editor={editing ? editor : null} />}
        // Export prints the saved version, else the generated draft; never while editing.
        onExport={!editing && editor ? () => printResume(fileName, viewHtml) : undefined}
        mode={editing ? "edit" : "view"}
        saving={saving}
        onEdit={onEdit}
        onCancel={onCancel}
        onSave={onSave}
        paged
      >
        {editing ? (
          <PagedResumeEditor editor={editor} onPageCount={setPageCount} />
        ) : (
          <ReadOnlyDocument>
            <PagedResumeEditor editor={editor} onPageCount={setPageCount} />
          </ReadOnlyDocument>
        )}
      </DocumentCard>
      <ResumePrint html={viewHtml} />
    </>
  );
}

function ErrorBody({ message, onRetry }) {
  return (
    <div className="flex w-full flex-col items-start gap-sp16">
      <Banner variant="error" className="w-full">
        {message}
      </Banner>
      <Button variant="primary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ClosedJobBody() {
  return (
    <Placeholder>
      <p className="m-0 text-body-medium text-neutral-700">This job is no longer accepting applications.</p>
    </Placeholder>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

// One tab's edit session. Dirty: in edit mode, and the document differs from the editor's own
// first serialization of it (so typing and then undoing is not a change).
const NO_EDIT = { editing: false, baseline: null, draft: null };
const isDirty = (edit) => edit.editing && edit.draft != null && edit.baseline != null && edit.draft !== edit.baseline;

export default function CustomizeApplicationPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const back = useListReturn();

  const { job, status: jobStatus } = useJob(jobId);
  // Arriving never starts anything: each tab starts its call only from its own button.
  const tailoring = useTailoring(jobId);
  const cover = useCoverLetter(jobId);
  const writingStyle = useWritingStyle();
  const { reload: reloadWritingStyle } = writingStyle;
  const [tab, setTab] = useState("resume");
  const applyNow = useApplyNow();
  const { showError } = useJobActions();

  // "Set your writing style" opens Change Preferences in another browser tab, so this page and its
  // in-memory edits stay put. Coming back re-reads the style (a GET, no call) so "Will use" updates.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible") reloadWritingStyle();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [reloadWritingStyle]);

  // The header's websites are linked from the profile when the HTML is built; wait for the profile so the
  // editor (which loads its HTML once) never opens without them. A failed read just means no website links.
  const { profile, status: profileStatus } = useProfile();
  const websites = profile?.websites;
  const draftHtml = useMemo(() => (tailoring.phase === "done" ? draftToHtml(tailoring.blocks, { websites }) : ""), [tailoring.phase, tailoring.blocks, websites]);
  const letterHtml = useMemo(() => (cover.phase === "done" ? letterToHtml(cover.blocks, { websites }) : ""), [cover.phase, cover.blocks, websites]);
  const isDesktop = useIsDesktop();

  // Saved edits (GET/PUT /api/jobs/:id/edited), one per tab, for the CURRENT draft or letter. A
  // document generated in this visit is new, so it has none to read.
  const resumeDoc = useEditedDocument(jobId, "resume", { enabled: tailoring.phase === "done", skipRead: tailoring.live });
  const letterDoc = useEditedDocument(jobId, "cover", { enabled: cover.phase === "done", skipRead: cover.live });

  // Each tab's edit session, kept here (not in its editor) so it survives switching tabs:
  // editing: the tab is in edit mode; baseline: the editor's first serialization of the document;
  // draft: the latest HTML since. Unsaved until Save; gone on Cancel, or when the page is left
  // after the "Discard changes?" confirm.
  const [edits, setEdits] = useState({ resume: NO_EDIT, cover: NO_EDIT });
  const [saving, setSaving] = useState(false);
  const anyDirty = isDirty(edits.resume) || isDirty(edits.cover);

  // Leaving the page (breadcrumb, side nav, browser back) with unsaved edits asks first; so does a
  // refresh or closing the window. Only when something is unsaved.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => anyDirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!anyDirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const checking = jobStatus === "loading" || profileStatus === "loading" || tailoring.phase === "checking" || cover.phase === "checking";
  const showCheckingLoader = useDelayedFlag(checking, LOADER_DELAY_MS);

  if (checking) {
    // Nothing for the first moment, then the dots, centred in the content area.
    return (
      <MainLayout activeItem="recommendations" centerContent>
        {showCheckingLoader && <DotsLoader label="Loading your application" />}
      </MainLayout>
    );
  }

  if (jobStatus !== "ready") {
    return (
      <MainLayout activeItem="recommendations">
        <TitleRow jobId={jobId} />
        <div className="mt-sp24 flex flex-col items-center gap-sp24 pt-sp40 text-center">
          <p className="m-0 text-body-medium text-neutral-500">
            {jobStatus === "not_found" ? "This job couldn't be found." : "Couldn't load this job right now. Try refreshing the page."}
          </p>
          <Button variant="primary" onClick={() => navigate(back.to, { state: back.state })}>
            Back to {back.label}
          </Button>
        </div>
      </MainLayout>
    );
  }

  // ── Resume tab ──
  const resumeRunning = tailoring.phase === "waiting" || tailoring.phase === "streaming";
  const resumeReady = tailoring.phase === "done";
  // View mode shows the saved edit when there is one, else the generated draft. Until the saved
  // edit has been read, the document stays the plain read-only copy.
  const resumeHtml = resumeDoc.saved?.html ?? draftHtml;
  const resumeName = tailoring.blocks.find((b) => b?.kind === "header")?.name ?? null;

  // ── Cover Letter tab ──
  const letterRunning = cover.phase === "waiting" || cover.phase === "streaming";
  const letterReady = cover.phase === "done";
  const letterCurrentHtml = letterDoc.saved?.html ?? letterHtml;
  const letterName = cover.blocks[0]?.kind === "header" ? cover.blocks[0].name ?? null : null;
  // Nothing is sent: the server resolves the resume source by job id (the saved edited resume, else
  // the saved tailored draft, else the base resume).
  const generateLetter = () => cover.generate();

  // ── Edit sessions ──
  const startEdit = (t) => setEdits((prev) => ({ ...prev, [t]: { editing: true, baseline: null, draft: null } }));
  const cancelEdit = (t) => setEdits((prev) => ({ ...prev, [t]: NO_EDIT }));
  const saveEdit = async (t, doc) => {
    const current = edits[t];
    // Saving with no changes is a no-op: back to view mode, nothing sent.
    if (!isDirty(current)) {
      cancelEdit(t);
      return;
    }
    setSaving(true);
    try {
      await doc.save(current.draft);
      cancelEdit(t);
    } catch (err) {
      // No success toast (the change of state is the feedback); a failure stays in edit mode.
      console.warn("[customize] couldn't save the edit:", err);
      showError("Couldn't save your edits. Try again.");
    } finally {
      setSaving(false);
    }
  };
  // The editor's callbacks only use the functional form of setEdits, so they stay correct even
  // though the editor keeps the first copy of them.
  // The card remounts when the tab, the mode or the saved version changes, so each loads its own HTML.
  const sessionKey = (t, doc) => `${t}-${edits[t].editing ? "edit" : "view"}-${doc.saved?.savedAt ?? "generated"}`;
  const sessionProps = (t, doc, viewHtml) => ({
    viewHtml,
    editing: edits[t].editing,
    initialHtml: edits[t].draft ?? viewHtml,
    hasBaseline: edits[t].baseline != null,
    onBaseline: (html) => setEdits((prev) => ({ ...prev, [t]: { ...prev[t], baseline: prev[t].baseline ?? html } })),
    onDraft: (html) => setEdits((prev) => ({ ...prev, [t]: { ...prev[t], draft: html } })),
    onEdit: () => startEdit(t),
    onCancel: () => cancelEdit(t),
    onSave: () => saveEdit(t, doc),
    saving,
  });

  let side;
  let documentArea;

  if (tab === "resume") {
    let body;
    if (tailoring.phase === "error") {
      body = <ErrorBody message={tailoring.error} onRetry={tailoring.start} />;
    } else if (tailoring.phase === "idle") {
      body = job.closed ? (
        <ClosedJobBody />
      ) : (
        // Figma "Resume - Blank".
        <div className="flex w-full flex-col items-center gap-sp12 px-sp16 py-sp80 text-center">
          <p className="m-0 text-body-large font-medium text-neutral-800">No resume yet</p>
          <p className="m-0 max-w-sm text-body-medium text-neutral-500">
            We&apos;ll generate one using this job&apos;s description and your resume.
          </p>
          <Button variant="secondary" onClick={tailoring.start}>
            Generate resume
          </Button>
        </div>
      );
    } else if (resumeRunning) {
      body = <StreamingDocument plan={tailoring.plan} blocks={tailoring.blocks} currentIndex={tailoring.currentIndex} />;
    } else if (resumeReady) {
      // Mobile reads it only. The draft's HTML is escaped by draftToHtml; edits come from the
      // editor's own serializer, which only writes the schema's tags.
      body = <div className={`${RESUME_DOCUMENT_CLASSES} [&_a]:cursor-pointer`} onClick={openDocumentLink} dangerouslySetInnerHTML={{ __html: resumeHtml }} />;
    }

    side = (
      <>
        <TailoredFor job={job} />
        {(tailoring.phase === "idle" || tailoring.phase === "error") && <ResumeWillUse />}
        {(resumeRunning || resumeReady) && <ResumeAssistant tailoring={tailoring} />}
        {resumeReady && tailoring.gaps?.length > 0 && <GapToReview gaps={tailoring.gaps} animate={tailoring.live} />}
      </>
    );
    // The saved edit is read before the editor mounts, so the document never shows the generated
    // draft and then swaps.
    documentArea =
      resumeReady && isDesktop && resumeDoc.status === "ready" ? (
        <EditableDocumentCard
          key={sessionKey("resume", resumeDoc)}
          name={resumeName}
          label="Resume"
          company={job.company.name}
          {...sessionProps("resume", resumeDoc, resumeHtml)}
        />
      ) : (
        <DocumentCard name={resumeName} label="Resume" toolbar={<EditorToolbar />}>
          {body}
        </DocumentCard>
      );
  } else {
    let body;
    if (cover.phase === "error") {
      body = <ErrorBody message={cover.error} onRetry={generateLetter} />;
    } else if (cover.phase === "idle") {
      body = job.closed ? (
        <ClosedJobBody />
      ) : (
        // Figma "Cover letter - Blank". The resume named here follows the Resume tab.
        <div className="flex w-full flex-col items-center gap-sp12 px-sp16 py-sp80 text-center">
          <p className="m-0 text-body-large font-medium text-neutral-800">No cover letter yet</p>
          <p className="m-0 max-w-sm text-body-medium text-neutral-500">
            We&apos;ll generate one using this job&apos;s description, {resumeReady ? "your tailored resume" : "your resume"}, and
            your writing style if you&apos;ve set one.
          </p>
          <Button variant="secondary" onClick={generateLetter}>
            Generate cover letter
          </Button>
        </div>
      );
    } else if (letterRunning) {
      body = <LetterStreamingDocument
          plan={cover.plan}
          blocks={cover.blocks}
          currentIndex={cover.currentIndex}
          currentKind={cover.currentKind}
        />;
    } else if (letterReady) {
      // Mobile reads it only; letterToHtml escapes every piece of text.
      body = <div className={`${RESUME_DOCUMENT_CLASSES} [&_a]:cursor-pointer`} onClick={openDocumentLink} dangerouslySetInnerHTML={{ __html: letterCurrentHtml }} />;
    }

    side = (
      <>
        <TailoredFor job={job} />
        {(cover.phase === "idle" || cover.phase === "error") && (
          <WillUse
            hasTailoredDraft={resumeReady}
            style={writingStyle}
            onSetStyle={() => window.open("/preferences?tab=cover-letter", "_blank", "noopener")}
          />
        )}
        {(letterRunning || letterReady) && <CoverLetterAssistant cover={cover} company={job.company.name} />}
      </>
    );
    documentArea =
      letterReady && isDesktop && letterDoc.status === "ready" ? (
        <EditableDocumentCard
          key={sessionKey("cover", letterDoc)}
          name={letterName}
          label="Cover Letter"
          company={job.company.name}
          {...sessionProps("cover", letterDoc, letterCurrentHtml)}
        />
      ) : (
        <DocumentCard name={letterName} label="Cover Letter" toolbar={<EditorToolbar />}>
          {body}
        </DocumentCard>
      );
  }

  return (
    <MainLayout activeItem="recommendations">
      {/* Below md the page starts 40 under the top bar (Figma mobile): the layout's 16 plus 24. */}
      <div className="flex flex-col gap-sp24 pt-sp24 md:gap-sp16 md:pt-0">
        <TitleRow
          jobId={jobId}
          action={
            // Same as "Apply now": opens the posting, then saves the pending application. Always
            // enabled (Figma 2668:8510), except for a closed job. Saves and discards nothing.
            <Button
              variant="primary"
              iconPosition="right"
              icon={<ArrowUpRight size={18} />}
              disabled={job.closed}
              onClick={() => applyNow(job)}
            >
              Apply
            </Button>
          }
        />
        <SecondaryTabBar tabs={TABS} activeKey={tab} onChange={setTab} />

        {/* Side by side from lg (1024px, next to the nav rail; Figma 2634:45418). Below that the side column stacks above the document, so
            the document (and its sheets, which scale to fit) gets the full column width; desktop
            editing still runs from md. Mobile frames: see TitleRow. */}
        <div className="flex flex-col gap-sp24 lg:flex-row lg:items-start">
          <div className="order-1 flex w-full flex-col gap-sp24 lg:order-2 lg:w-side-panel lg:shrink-0">{side}</div>
          <div className="order-2 flex min-w-0 flex-1 lg:order-1">{documentArea}</div>
        </div>
      </div>

      {/* Not in Figma: the existing Modal as a confirm. ESC and the backdrop mean "Keep editing". */}
      <Modal
        variant="decision"
        isOpen={blocker.state === "blocked"}
        title="Discard changes?"
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        onConfirm={() => blocker.proceed()}
        onClose={() => blocker.reset()}
      >
        You have unsaved edits. If you leave, they&apos;ll be lost.
      </Modal>
    </MainLayout>
  );
}
