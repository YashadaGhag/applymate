import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CircleAlert, CircleCheckBig, Trash2 } from "lucide-react";
import Navbar from "../components/Navbar";
import Button from "../components/Button";
import uploadIcon from "../assets/File Upload.svg";
import loaderSvg from "../assets/loader.svg";
import { useOnboarding } from "../context/OnboardingContext";
import { extractResume } from "../utils/resumeExtraction";
import { UPLOAD_HELP } from "../utils/uploadHelp";

// No legacy .doc: it's a binary format the server can't read text from, so it could never
// be extracted (see server/resume/extractText.js).
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

const MAX_SIZE = 25 * 1024 * 1024;

function isValidFileType(file) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function OnboardingResumePage() {
  const navigate = useNavigate();
  const [state, setState] = useState("default");
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef(null);
  const latestUpload = useRef(0);
  const { applyResumeExtraction } = useOnboarding();

  const handleFile = (file) => {
    if (!isValidFileType(file)) {
      setState("error");
      setErrorMessage("Unsupported file format. Please upload PDF or DOCX");
      return;
    }
    if (file.size > MAX_SIZE) {
      setState("error");
      setErrorMessage("File exceeds 25MB limit");
      return;
    }

    setFileName(file.name);
    setState("uploading");
    setErrorMessage("");

    // The spinner covers upload + extraction. extractResume never throws; if extraction
    // fails the file still counts as uploaded and the Role page is filled in by hand.
    const uploadId = ++latestUpload.current;
    extractResume(file).then((result) => {
      if (uploadId !== latestUpload.current) return; // file was removed or replaced meanwhile
      applyResumeExtraction(result);
      setState("uploaded");
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDelete = () => {
    latestUpload.current += 1;
    setState("default");
    setFileName("");
    setErrorMessage("");
  };

  const handleTryAgain = () => {
    setState("default");
    setErrorMessage("");
  };

  const handleContinue = () => {
    if (state === "default") {
      setState("error");
      setErrorMessage("Please upload a resume to continue");
      return;
    }
    if (state === "uploading") return;
    if (state === "uploaded") {
      navigate("/onboarding/role");
    }
  };

  const isError = state === "error";
  const canPick = state === "default" || state === "error";

  const dropzoneBg = isError ? "bg-error-50" : "bg-primary-50";
  const dropzoneBorder = isError
    ? "border border-dashed border-error-500"
    : "border border-dashed border-primary-500";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar variant="onboarding" />

      <main className="flex flex-1 justify-center px-sp16 pb-sp40 md:px-sp40 xl:px-sp80">
        <div className="mt-sp40 w-full max-w-130">
          {/* Heading group */}
          <div className="flex flex-col gap-sp12">
            <h4 className="text-body-large font-medium text-neutral-800 text-center">Upload Resume</h4>
            <p className="text-center text-body-medium font-regular text-neutral-700">
              Our AI will analyze your resume and suggest optimizations for your
              target roles
            </p>
          </div>

          {/* Dropzone */}
          <div
            className={`mt-sp32 flex h-[182px] w-full flex-col items-center justify-center gap-sp16 rounded-md px-sp8 py-sp40 md:px-sp24 ${dropzoneBg} ${dropzoneBorder} ${canPick ? "cursor-pointer" : "cursor-default"}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => {
              if (canPick) fileInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                if (state === "default" || state === "error") {
                  fileInputRef.current?.click();
                }
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={handleInputChange}
            />

            {/* Icon */}
            {state === "default" && (
              <img src={uploadIcon} alt="Upload" className="size-[60px]" />
            )}
            {state === "error" && (
              <CircleAlert size={60} className="text-error-500" />
            )}
            {state === "uploading" && (
              <img
                src={loaderSvg}
                alt="Uploading"
                className="size-[60px] animate-spin"
                style={{ animationDuration: "1.5s" }}
              />
            )}
            {state === "uploaded" && (
              <CircleCheckBig size={60} className="text-primary-500" />
            )}

            {/* Text below icon */}
            {(state === "default" || state === "error") && (
              <p className="text-body-medium text-neutral-700">
                Drag and drop your resume here or{" "}
                <span className="cursor-pointer text-primary-500 underline">
                  Choose file
                </span>
              </p>
            )}
            {state === "uploading" && (
              <p className="text-body-medium text-neutral-700">Uploading file...</p>
            )}
            {state === "uploaded" && (
              <div className="flex items-center gap-sp8">
                <p className="text-body-medium text-neutral-700">
                  Chosen file:{" "}
                  <span className="font-medium text-neutral-800">{fileName}</span>
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  className="cursor-pointer border-none bg-transparent p-0"
                  aria-label="Remove file"
                >
                  <Trash2 size={24} className="text-error-500" />
                </button>
              </div>
            )}
          </div>

          {/* File support text */}
          <p className="mt-sp12 text-body-small text-neutral-500">
            {UPLOAD_HELP}
          </p>

          {/* Error message */}
          {isError && errorMessage && (
            <p className="mt-sp4 text-body-small text-error-500">
              {errorMessage === "Upload failed. Try again" ? (
                <>
                  Upload failed.{" "}
                  <span
                    className="cursor-pointer text-primary-500 underline"
                    onClick={handleTryAgain}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleTryAgain();
                    }}
                  >
                    Try again
                  </span>
                </>
              ) : (
                errorMessage
              )}
            </p>
          )}

          {/* Continue button */}
          <div className="mt-sp40 flex justify-center">
            <Button
              variant="primary"
              iconPosition="right"
              icon={<ArrowRight size={18} />}
              disabled={isError}
              onClick={handleContinue}
            >
              Continue
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
