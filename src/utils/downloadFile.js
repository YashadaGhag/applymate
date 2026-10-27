// Saves a file through a temporary link: a file the server sends as an attachment (with its own
// name), or a just-picked file from the browser (an object URL).
export function downloadFile(href, fileName) {
  const link = document.createElement("a");
  link.href = href;
  if (fileName) link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
