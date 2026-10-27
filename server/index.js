import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import companiesRouter from "./routes/companies.js";
import stateRouter from "./routes/state.js";
import updateStatusRouter from "./routes/updateStatus.js";
import othersStartRouter from "./routes/othersStart.js";
import watchlistRetryRouter from "./routes/watchlistRetry.js";
import scoringRefreshRouter from "./routes/scoringRefresh.js";
import jobsRouter from "./routes/jobs.js";
import applicationsRouter from "./routes/applications.js";
import savedJobsRouter from "./routes/savedJobs.js";
import resumeRouter from "./routes/resume.js";
import locationsRouter from "./routes/locations.js";
import tailoringRouter from "./routes/tailoring.js";
import writingStyleRouter from "./routes/writingStyle.js";
import coverLetterRouter from "./routes/coverLetter.js";
import editedRouter from "./routes/edited.js";
import pdfRouter from "./routes/pdf.js";
import roleSuggestionsRouter from "./routes/roleSuggestions.js";
import { recoverInterruptedReplacement } from "./ai/replaceResume.js";
import { startScheduler } from "./scheduler/scheduler.js";
import { missingKeyWarnings } from "./startupWarnings.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = "127.0.0.1";

app.use(cors());
// Before the app-wide JSON parser: these routes take bodies past its 100kb limit (a base64 letter
// file; the Resume tab text for a cover letter) and have their own parsers.
app.use("/api", writingStyleRouter);
app.use("/api", coverLetterRouter);
app.use("/api", editedRouter);
app.use(express.json());

app.use("/api/companies", companiesRouter);
app.use("/api", stateRouter);
app.use("/api", othersStartRouter);
app.use("/api", watchlistRetryRouter);
app.use("/api", scoringRefreshRouter);
app.use("/api", updateStatusRouter); // before jobsRouter: "/jobs/:id" would take update-status
app.use("/api", jobsRouter);
app.use("/api", applicationsRouter);
app.use("/api", savedJobsRouter);
app.use("/api", pdfRouter);
app.use("/api", resumeRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/roles", roleSuggestionsRouter);
app.use("/api", tailoringRouter);

// A resume replacement left "running" by a server that died would spin forever on the page.
if (recoverInterruptedReplacement()) console.warn("[replace-resume] marked an interrupted replacement as failed");

// Bind to loopback only — the store holds personal data (resume answers,
// watchlist) and must never be reachable from another device on the network.
app.listen(PORT, HOST, () => {
  console.log(`ApplyMate API server listening on http://${HOST}:${PORT}`);
  for (const line of missingKeyWarnings()) console.warn(line);
  startScheduler();
});
