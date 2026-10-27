import { useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArrowUpDown,
  BarChart3,
  BriefcaseBusiness,
  Calendar,
  Check,
  FileText,
  ScrollText,
  SlidersHorizontal,
  Undo2,
  Users,
  X,
} from "lucide-react";
import TrackerEmpty from "../assets/tracker-empty.svg";
import MainLayout from "../components/MainLayout";
import SearchBar from "../components/SearchBar/SearchBar";
import Select from "../components/Select/Select";
import Button from "../components/Button/Button";
import DotsLoader from "../components/DotsLoader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import TableItem from "../components/TableItem";
import TableText from "../components/TableText";
import TableCard from "../components/TableCard";
import StatusChip from "../components/StatusChip";
import MatchChip from "../components/MatchChip";
import RowActionsMenu from "../components/RowActionsMenu";
import CompanyAvatar from "../components/CompanyAvatar/CompanyAvatar";
import { useApplications } from "../hooks/useApplications";
import { useDelayedFlag } from "../hooks/useDelayedFlag";
import { useListMemory } from "../hooks/useListMemory";
import { clampPage, parseChoice, parsePage, withParams } from "../utils/listView";
import {
  PAGE_SIZE,
  STATUS_LABELS,
  STATUS_ORDER,
  computeStats,
  formatTableDate,
  matchesSearch,
  nextSort,
  pageSlice,
  salaryValue,
  sortRows,
} from "../utils/trackerTable";

// A load faster than this shows no loader at all.
const LOADER_DELAY_MS = 300;

const ALL_STATUSES = "All status";
const ARCHIVED = "Archived";
// Select values are the labels; this maps a chosen label back to the status it filters on.
const STATUS_BY_LABEL = Object.fromEntries(Object.entries(STATUS_LABELS).map(([status, label]) => [label, status]));
const STATUS_FILTER_OPTIONS = [{ items: [ALL_STATUSES, ...STATUS_ORDER.map((s) => STATUS_LABELS[s]), ARCHIVED] }];

const COLUMNS = [
  { key: "company", label: "Company", sortable: true },
  { key: "title", label: "Job title" },
  { key: "appliedOn", label: "Applied on", sortable: true, className: "w-32" },
  { key: "salary", label: "Salary", sortable: true, className: "w-36" },
  { key: "match", label: "Match", sortable: true, align: "center", className: "w-24" },
  { key: "status", label: "Status", sortable: true, className: "w-44" },
  { key: "actions", label: "Actions", align: "center", className: "w-24" },
];

// What each column sorts by. An application that was never marked applied (pending) sorts by when it
// was added, so it sits among the newest.
const SORT_GETTERS = {
  company: (row) => row.job.company.name,
  appliedOn: (row) => new Date(row.appliedAt ?? row.createdAt).getTime(),
  salary: (row) => salaryValue(row.job.compensation),
  match: (row) => row.scoreAtApply,
  status: (row) => STATUS_ORDER.indexOf(row.status),
};

// The Figma stat cards: icon colours follow the Figma icons.
function statCards(stats) {
  return [
    { label: "Total Applications", icon: FileText, value: String(stats.total), iconClassName: "text-neutral-400" },
    { label: "Actively Interviewing", icon: Users, value: String(stats.interviewing), iconClassName: "text-purple-500" },
    { label: "Response Rate", icon: BarChart3, value: `${stats.responseRate}%`, iconClassName: "text-success-500" },
    { label: "Applications this week", icon: Calendar, value: String(stats.thisWeek), iconClassName: "text-warning-500" },
  ];
}

function StatCards({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-sp16 md:grid-cols-4 md:gap-sp24">
      {statCards(stats).map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  );
}

// The row actions from the Figma menu (2728:11740), by status. "Practice interview" is not built.
// "Revert to application pending" (Applied only) undoes a Mark as applied made by mistake.
// An archived row can only be viewed (no unarchive in V1).
function actionItems(row, { navigate, changeStatus, archive }) {
  const view = {
    key: "view",
    label: "View application details",
    icon: FileText,
    onSelect: () => navigate(`/jobs/${encodeURIComponent(row.jobId)}`),
  };
  if (row.archived) return [view];

  const archiveItem = { key: "archive", label: "Archive", icon: Archive, onSelect: () => archive(row.jobId) };
  const to = (status, icon) => ({ key: status, label: STATUS_LABELS[status], icon, onSelect: () => changeStatus(row.jobId, status) });
  const offer = to("offer", ScrollText);
  const interviewing = to("interviewing", Users);
  const notMoving = to("not_moving_forward", X);

  switch (row.status) {
    case "pending":
      return [view, { key: "mark", label: "Mark as applied", icon: Check, onSelect: () => changeStatus(row.jobId, "applied") }];
    case "applied":
      return [
        view,
        {
          key: "change",
          label: "Change status",
          icon: ArrowUpDown,
          submenu: [
            offer,
            interviewing,
            notMoving,
            { key: "revert", label: "Revert to application pending", icon: Undo2, onSelect: () => changeStatus(row.jobId, "pending") },
          ],
        },
      ];
    case "interviewing":
      return [view, archiveItem, { key: "change", label: "Change status", icon: ArrowUpDown, submenu: [offer, notMoving] }];
    default:
      return [view, archiveItem];
  }
}

function TrackerRow({ row, actions }) {
  const { company, title, compensation } = row.job;
  return (
    <TableItem>
      <TableText tone="heading" leading={<CompanyAvatar name={company.name ?? "?"} domain={company.domain} size={24} />}>
        {company.name ?? "-"}
      </TableText>
      <TableText tone="body">
        {/* The link sets its own colour: the global link colour in src/index.css would win. */}
        <Link
          to={`/jobs/${encodeURIComponent(row.jobId)}`}
          title={title ?? undefined}
          className="text-neutral-700 hover:text-neutral-700 hover:underline"
        >
          {title ?? "-"}
        </Link>
      </TableText>
      <TableText>{formatTableDate(row.appliedAt)}</TableText>
      <TableText>{compensation ?? "-"}</TableText>
      <TableText align="center">
        <MatchChip score={row.scoreAtApply} />
      </TableText>
      <TableText>
        <StatusChip status={row.status} />
      </TableText>
      <TableText align="center">
        <RowActionsMenu items={actions} label={`Actions for ${company.name ?? "this company"}, ${title ?? "this job"}`} />
      </TableText>
    </TableItem>
  );
}

// The same row as a card, shown below 744px (Figma mobile 2830:15138).
function TrackerCard({ row, actions }) {
  const { company, title, compensation } = row.job;
  return (
    <TableCard
      logo={<CompanyAvatar name={company.name ?? "?"} domain={company.domain} size={24} />}
      company={company.name ?? "-"}
      title={
        <Link to={`/jobs/${encodeURIComponent(row.jobId)}`} className="text-neutral-700 hover:text-neutral-700 hover:underline">
          {title ?? "-"}
        </Link>
      }
      actions={<RowActionsMenu items={actions} label={`Actions for ${company.name ?? "this company"}, ${title ?? "this job"}`} />}
      chipsLeft={<StatusChip status={row.status} />}
      chipsRight={<MatchChip score={row.scoreAtApply} showLabel />}
      details={[
        { label: "Applied on", value: formatTableDate(row.appliedAt) },
        { label: "Salary", value: compensation ?? "-" },
      ]}
    />
  );
}

// Shown only before any application exists (Figma 2444:15191): every stat is 0, the search and
// selects are disabled.
function EmptyBody({ navigate }) {
  return (
    <>
      <div className="flex items-center gap-sp16">
        <div className="min-w-0 max-w-112 flex-1">
          <SearchBar placeholder="Search Company or Job Title..." disabled />
        </div>
        <div className="h-5 w-px shrink-0 bg-neutral-100" />
        <div className="shrink-0">
          <Select placeholder="All statuses" disabled />
        </div>
        <div className="shrink-0">
          <Select placeholder="Filter" leftIcon={<SlidersHorizontal size={16} />} showChevron={false} disabled />
        </div>
      </div>

      <div className="flex flex-col items-center gap-sp24">
        <div className="flex flex-col items-center">
          <img src={TrackerEmpty} alt="" className="-mt-sp8" />
          <h2 className="pb-sp8 text-center text-body-medium font-medium text-neutral-800">Your journey starts here!</h2>
          <p className="max-w-sm px-sp8 text-center text-body-medium font-regular text-neutral-500">
            You haven&apos;t tracked any applications yet. Start by exploring AI-tailored job recommendations built around
            your skills and goals.
          </p>
        </div>
        <Button variant="primary" iconPosition="left" icon={<BriefcaseBusiness size={18} />} onClick={() => navigate("/jobs")}>
          Go to job recommendations
        </Button>
      </div>
    </>
  );
}

// The view is in the URL query (search, status filter incl. Archived, sort, page), so a reload, the browser's
// back button and the way back from Job Details keep it. Defaults are left out of the URL.
const VIEW_DEFAULTS = { q: "", status: ALL_STATUSES, sort: "appliedOn", dir: "desc", page: 1 };

function DataBody({ applications, actionsFor }) {
  const [params, setParams] = useSearchParams();
  const update = (patch) => setParams((prev) => withParams(prev, patch, VIEW_DEFAULTS), { replace: true });
  const query = params.get("q") ?? "";
  const statusLabel = parseChoice(params.get("status"), STATUS_FILTER_OPTIONS[0].items, ALL_STATUSES);
  const sort = useMemo(
    () => ({ key: parseChoice(params.get("sort"), Object.keys(SORT_GETTERS), "appliedOn"), direction: params.get("dir") === "asc" ? "asc" : "desc" }),
    [params]
  );
  const page = parsePage(params.get("page"));
  const setPage = (next) => update({ page: next });

  // Default view hides archived rows; "Archived" shows only those; a status shows that status's
  // rows that aren't archived.
  const filtered = useMemo(() => {
    const rows = applications.filter((row) => {
      if (statusLabel === ARCHIVED) return row.archived;
      if (row.archived) return false;
      return statusLabel === ALL_STATUSES || row.status === STATUS_BY_LABEL[statusLabel];
    });
    return rows.filter((row) => matchesSearch({ company: row.job.company, title: row.job.title }, query));
  }, [applications, query, statusLabel]);

  const sorted = useMemo(() => sortRows(filtered, sort, SORT_GETTERS), [filtered, sort]);
  const currentPage = clampPage(page, sorted.length, PAGE_SIZE);
  const rows = pageSlice(sorted, currentPage);
  // A page that no longer exists (rows archived or removed) is corrected in the URL too.
  useEffect(() => {
    if (currentPage !== page) update({ page: currentPage });
  });

  return (
    <div className="flex flex-col gap-sp16">
      <div className="flex flex-col gap-sp16 min-[744px]:flex-row min-[744px]:items-center">
        <div className="min-w-0 flex-1 min-[744px]:max-w-112">
          <SearchBar
            placeholder="Search Company or Job Title..."
            value={query}
            onChange={(e) => update({ q: e.target.value, page: 1 })}
            onClear={() => update({ q: "", page: 1 })}
          />
        </div>
        <div className="hidden h-5 w-px shrink-0 bg-neutral-100 min-[744px]:block" />
        <div className="min-[744px]:shrink-0">
          <Select
            value={statusLabel}
            onChange={(label) => update({ status: label, page: 1 })}
            options={STATUS_FILTER_OPTIONS}
            menuWidth="content"
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="m-0 py-sp40 text-center text-body-medium text-neutral-500">No applications match your search</p>
      ) : (
        <Table
          caption="Applications"
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
          cards={rows.map((row) => (
            <TrackerCard key={row.jobId} row={row} actions={actionsFor(row)} />
          ))}
        >
          {rows.map((row) => (
            <TrackerRow key={row.jobId} row={row} actions={actionsFor(row)} />
          ))}
        </Table>
      )}
    </div>
  );
}

export default function ApplicationTrackerPage() {
  const navigate = useNavigate();
  const { status, applications, changeStatus, archive } = useApplications();
  // Scroll position is put back when arriving by back, a reload or a return link from Job Details.
  useListMemory(status !== "loading");
  const showLoader = useDelayedFlag(status === "loading", LOADER_DELAY_MS);

  if (status === "loading") {
    return (
      <MainLayout activeItem="tracker" centerContent>
        {showLoader && <DotsLoader label="Loading your applications" />}
      </MainLayout>
    );
  }

  const stats = computeStats(applications);

  return (
    <MainLayout titleOffset activeItem="tracker">
      {/* Header block, stat cards, filter row and content are 40 apart (Figma 2444:15191). The
          subtitle is Figma 2650:7174 (12/16 Regular, help text color). */}
      <div className="flex flex-col gap-sp24 min-[744px]:gap-sp40">
        <div>
          <h5 className="text-h5 font-medium text-neutral-800">Application Tracker</h5>
          <p className="mt-sp8 text-body-small font-regular text-neutral-500">
            Every job you’ve applied to, and where each one stands.
          </p>
        </div>

        {status !== "error" && <StatCards stats={stats} />}

        {status === "error" ? (
          <p className="m-0 text-center text-body-medium text-neutral-500">
            Couldn&apos;t load your applications right now. Try refreshing the page.
          </p>
        ) : applications.length === 0 ? (
          <EmptyBody navigate={navigate} />
        ) : (
          <DataBody applications={applications} actionsFor={(row) => actionItems(row, { navigate, changeStatus, archive })} />
        )}
      </div>
    </MainLayout>
  );
}
