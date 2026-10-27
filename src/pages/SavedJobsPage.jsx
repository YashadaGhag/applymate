import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookmarkMinus, BriefcaseBusiness, FileText, SlidersHorizontal } from "lucide-react";
import MainLayout from "../components/MainLayout";
import SearchBar from "../components/SearchBar/SearchBar";
import Select from "../components/Select/Select";
import Button from "../components/Button/Button";
import DotsLoader from "../components/DotsLoader";
import Table from "../components/Table";
import TableItem from "../components/TableItem";
import TableText from "../components/TableText";
import TableCard from "../components/TableCard";
import MatchChip from "../components/MatchChip";
import RowActionsMenu from "../components/RowActionsMenu";
import CompanyAvatar from "../components/CompanyAvatar/CompanyAvatar";
import { useSavedJobs } from "../hooks/useSavedJobs";
import { useDelayedFlag } from "../hooks/useDelayedFlag";
import { useListMemory } from "../hooks/useListMemory";
import { clampPage, parseChoice, parsePage, withParams } from "../utils/listView";
import { useJobActions } from "../context/JobActionsContext";
import { PAGE_SIZE, formatTableDate, matchesSearch, nextSort, pageSlice, salaryValue, sortRows } from "../utils/trackerTable";
import SavedEmpty from "../assets/saved-empty.svg";

// A load faster than this shows no loader at all.
const LOADER_DELAY_MS = 300;

const COLUMNS = [
  { key: "company", label: "Company", sortable: true },
  { key: "title", label: "Job title" },
  { key: "savedOn", label: "Saved on", sortable: true, className: "w-32" },
  { key: "salary", label: "Salary", sortable: true, className: "w-36" },
  { key: "location", label: "Location", className: "w-44" },
  { key: "match", label: "Match", sortable: true, align: "center", className: "w-24" },
  { key: "actions", label: "Actions", align: "center", className: "w-24" },
];

// A job saved before dates were kept has no savedAt: it sorts last either way.
const SORT_GETTERS = {
  company: (job) => job.company.name,
  savedOn: (job) => (job.savedAt ? new Date(job.savedAt).getTime() : null),
  salary: (job) => salaryValue(job.compensation),
  match: (job) => job.score,
};

// Not in Figma: a small neutral chip beside the title of a job whose posting has closed.
function ClosedChip() {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-xl bg-neutral-50 px-sp8 text-body-small font-regular text-neutral-500">
      Closed
    </span>
  );
}

function SavedRow({ job, onRemove }) {
  const navigate = useNavigate();
  const { company, title } = job;
  // Not in Figma: View job details and Remove from saved.
  const actions = [
    { key: "view", label: "View job details", icon: FileText, onSelect: () => navigate(`/jobs/${encodeURIComponent(job.id)}`) },
    { key: "remove", label: "Remove from saved", icon: BookmarkMinus, onSelect: () => onRemove(job.id) },
  ];
  return (
    <TableItem>
      <TableText tone="heading" leading={<CompanyAvatar name={company.name ?? "?"} domain={company.domain} size={24} />}>
        {company.name ?? "-"}
      </TableText>
      <TableText tone="body" trailing={job.closed ? <ClosedChip /> : null}>
        {/* The link sets its own colour: the global link colour in src/index.css would win. */}
        <Link
          to={`/jobs/${encodeURIComponent(job.id)}`}
          title={title ?? undefined}
          className="text-neutral-700 hover:text-neutral-700 hover:underline"
        >
          {title ?? "-"}
        </Link>
      </TableText>
      <TableText>{formatTableDate(job.savedAt)}</TableText>
      <TableText>{job.compensation ?? "-"}</TableText>
      <TableText>{job.location ?? "-"}</TableText>
      <TableText align="center">
        <MatchChip score={job.score} />
      </TableText>
      <TableText align="center">
        <RowActionsMenu items={actions} label={`Actions for ${company.name ?? "this company"}, ${title ?? "this job"}`} />
      </TableText>
    </TableItem>
  );
}

// The same row as a card, shown below 744px (Figma mobile 2830:24310, which still draws the Tracker's
// "Applied on" and status chip: the card here uses Saved on and no status). Location is not in Figma.
function SavedCard({ job, onRemove }) {
  const navigate = useNavigate();
  const { company, title } = job;
  const actions = [
    { key: "view", label: "View job details", icon: FileText, onSelect: () => navigate(`/jobs/${encodeURIComponent(job.id)}`) },
    { key: "remove", label: "Remove from saved", icon: BookmarkMinus, onSelect: () => onRemove(job.id) },
  ];
  return (
    <TableCard
      logo={<CompanyAvatar name={company.name ?? "?"} domain={company.domain} size={24} />}
      company={company.name ?? "-"}
      title={
        <Link to={`/jobs/${encodeURIComponent(job.id)}`} className="text-neutral-700 hover:text-neutral-700 hover:underline">
          {title ?? "-"}
        </Link>
      }
      actions={<RowActionsMenu items={actions} label={`Actions for ${company.name ?? "this company"}, ${title ?? "this job"}`} />}
      chipsLeft={job.closed ? <ClosedChip /> : null}
      chipsRight={<MatchChip score={job.score} showLabel />}
      details={[
        { label: "Saved on", value: formatTableDate(job.savedAt) },
        { label: "Salary", value: job.compensation ?? "-" },
        { label: "Location", value: job.location ?? "-", wide: true },
      ]}
    />
  );
}

function Heading() {
  return (
    <div className="flex flex-col gap-sp8">
      <h5 className="text-h5 font-medium text-neutral-800">Saved Jobs</h5>
      <p className="text-body-small text-neutral-500">All the saved jobs will be displayed here</p>
    </div>
  );
}

// Shown only when nothing is saved (Figma 2444:15620): the search and Filter are disabled.
function EmptyPage({ navigate }) {
  return (
    <div className="flex flex-col items-center gap-sp40">
      <div className="flex w-full flex-col gap-sp40">
        <Heading />
        <div className="flex items-center gap-sp16">
          <div className="min-w-0 max-w-112 flex-1">
            <SearchBar placeholder="Search Company or Job Title..." disabled />
          </div>
          <div className="h-5 w-px shrink-0 bg-neutral-100" />
          <div className="shrink-0">
            <Select placeholder="Filter" leftIcon={<SlidersHorizontal size={16} />} showChevron={false} disabled />
          </div>
        </div>
      </div>

      {/* The grid illustration with the text laid over it, 115 from its top. */}
      <div className="relative">
        <img src={SavedEmpty} alt="" />
        <div className="absolute inset-x-0 top-29 flex flex-col items-center gap-sp24">
          <h2 className="text-center text-body-medium font-medium text-neutral-800">You don&apos;t have any saved jobs!</h2>
          <p className="max-w-sm px-sp8 text-center text-body-medium font-regular text-neutral-500">
            You haven&apos;t saved any jobs yet. Start by exploring AI-tailored job recommendations built around your skills
            and goals.
          </p>
          <Button variant="primary" iconPosition="left" icon={<BriefcaseBusiness size={18} />} onClick={() => navigate("/jobs")}>
            Go to job recommendations
          </Button>
        </div>
      </div>
    </div>
  );
}

// The view is in the URL query (search, sort, page), so a reload, the browser's back button and the way back
// from Job Details keep it. Defaults are left out of the URL.
const VIEW_DEFAULTS = { q: "", sort: "savedOn", dir: "desc", page: 1 };

function TablePage({ jobs, onRemove }) {
  const [params, setParams] = useSearchParams();
  const update = (patch) => setParams((prev) => withParams(prev, patch, VIEW_DEFAULTS), { replace: true });
  const query = params.get("q") ?? "";
  const sort = useMemo(
    () => ({ key: parseChoice(params.get("sort"), Object.keys(SORT_GETTERS), "savedOn"), direction: params.get("dir") === "asc" ? "asc" : "desc" }),
    [params]
  );
  const page = parsePage(params.get("page"));
  const setPage = (next) => update({ page: next });

  const filtered = useMemo(
    () => jobs.filter((job) => matchesSearch({ company: job.company, title: job.title }, query)),
    [jobs, query]
  );
  const sorted = useMemo(() => sortRows(filtered, sort, SORT_GETTERS), [filtered, sort]);
  const currentPage = clampPage(page, sorted.length, PAGE_SIZE);
  // A page that no longer exists (jobs removed from saved) is corrected in the URL too.
  useEffect(() => {
    if (currentPage !== page) update({ page: currentPage });
  });

  return (
    <div className="flex flex-col gap-sp24 min-[744px]:gap-sp40">
      <Heading />
      <div className="flex flex-col gap-sp16">
        <div className="flex items-center gap-sp16">
          <div className="min-w-0 flex-1 min-[744px]:max-w-112">
            <SearchBar
              placeholder="Search Company or Job Title..."
              value={query}
              onChange={(e) => update({ q: e.target.value, page: 1 })}
              onClear={() => update({ q: "", page: 1 })}
            />
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="m-0 py-sp40 text-center text-body-medium text-neutral-500">No saved jobs match your search</p>
        ) : (
          <Table
            caption="Saved jobs"
            columns={COLUMNS}
            sort={sort}
            onSort={(key) => {
              const next = nextSort(sort, key);
              update({ sort: next.key, dir: next.direction, page: 1 });
            }}
            total={sorted.length}
            page={currentPage}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            cards={pageSlice(sorted, currentPage).map((job) => (
              <SavedCard key={job.id} job={job} onRemove={onRemove} />
            ))}
          >
            {pageSlice(sorted, currentPage).map((job) => (
              <SavedRow key={job.id} job={job} onRemove={onRemove} />
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

export default function SavedJobsPage() {
  const navigate = useNavigate();
  const { status, savedJobs } = useSavedJobs();
  const { isSaved, toggleSave } = useJobActions();
  // Scroll position is put back when arriving by back, a reload or a return link from Job Details.
  useListMemory(status !== "loading");
  // Jobs removed on this page. The unsave is the bookmark's own optimistic write: the row goes at
  // once and, if the server refuses, isSaved rolls back to true and the row comes back.
  const [removed, setRemoved] = useState(() => new Set());
  const showLoader = useDelayedFlag(status === "loading", LOADER_DELAY_MS);

  const jobs = useMemo(() => savedJobs.filter((job) => !removed.has(job.id) || isSaved(job.id)), [savedJobs, removed, isSaved]);

  const remove = (jobId) => {
    setRemoved((prev) => new Set(prev).add(jobId));
    toggleSave(jobId);
  };

  if (status === "loading") {
    return (
      <MainLayout activeItem="saved" centerContent>
        {showLoader && <DotsLoader label="Loading your saved jobs" />}
      </MainLayout>
    );
  }

  return (
    <MainLayout titleOffset activeItem="saved">
      {status === "error" ? (
        <div className="flex flex-col gap-sp40">
          <Heading />
          <p className="m-0 text-center text-body-medium text-neutral-500">
            Couldn&apos;t load your saved jobs right now. Try refreshing the page.
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyPage navigate={navigate} />
      ) : (
        <TablePage jobs={jobs} onRemove={remove} />
      )}
    </MainLayout>
  );
}
