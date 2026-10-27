import fs from "node:fs";
import path from "node:path";

export const BROWSER_REQUIRED_MESSAGE = "Chrome or Edge is required to generate PDFs";

/**
 * The paths a Chrome, Edge or Chromium install usually has, in the order they are tried, for one
 * platform. `env` supplies the Windows program folders. Pure: no file system access.
 */
export function candidatePaths(platform, env = {}) {
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    const relative = [
      ["Google", "Chrome", "Application", "chrome.exe"],
      ["Microsoft", "Edge", "Application", "msedge.exe"],
      ["Chromium", "Application", "chrome.exe"],
    ];
    // Every Chrome location, then every Edge location, then Chromium.
    return relative.flatMap((parts) => roots.map((root) => path.win32.join(root, ...parts)));
  }
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/opt/microsoft/msedge/msedge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

/**
 * Finds a Chromium-based browser to print PDFs with: the CHROME_PATH environment variable first,
 * then the usual install paths for this platform (Chrome, Edge, Chromium). Returns the path, or
 * null when none exists. `exists` is injectable so the lookup can be tested without a file system.
 */
export function findBrowser({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  const explicit = env.CHROME_PATH?.trim();
  if (explicit && exists(explicit)) return explicit;
  return candidatePaths(platform, env).find((candidate) => exists(candidate)) ?? null;
}
