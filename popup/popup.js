/**
 * popup.js
 *
 * Drives the extension's popup UI: checks whether the active tab is a
 * YouTube watch page, lets the user pick an export format and whether
 * to include timestamps, and on click asks the content script
 * (extractor.js) for the transcript, formats it (via lib/format.js,
 * loaded separately in popup.html), and triggers a file download.
 *
 * No network requests happen from this file directly — all fetching is
 * delegated to the content script over chrome.runtime messaging, since
 * this popup has no access to the YouTube page's own context.
 */

// The message "action" this popup sends to request a transcript fetch.
// Must exactly match the constant of the same name in extractor.js.
const ACTION_FETCH_TRANSCRIPT = "FETCH_TRANSCRIPT";

// Any URL containing this substring is treated as a YouTube watch page.
const YOUTUBE_WATCH_URL_FRAGMENT = "youtube.com/watch";

// One converter per export format, each taking the transcript's
// "events" array and returning a ready-to-download string. toSRT()
// doesn't take an options object (SRT timestamps aren't optional), so
// it's wrapped here just to give every entry a uniform two-argument
// call signature — callers below never need to know which formats
// actually use their second argument.
const FORMAT_CONVERTERS = {
  txt: (events, options) => toPlainText(events, options),
  md: (events, options) => toMarkdown(events, options),
  srt: (events, _options) => toSRT(events),
};

// The MIME type to tag each format's Blob with. This matters beyond
// labeling: browsers can silently "correct" a mismatched file
// extension back to match what the MIME type implies, so each format
// needs its own accurate type or downloads may all land as .txt
// regardless of what the user picked.
const FORMAT_MIME_TYPES = {
  txt: "text/plain",
  md: "text/markdown",
  srt: "application/x-subrip",
};

const downloadButton = document.getElementById("download-btn");
const includeTimestampsCheckbox = document.getElementById("timestamps");
const statusMessageEl = document.getElementById("status");

/**
 * True if the given tab URL looks like a YouTube watch page — i.e.
 * one that extractor.js is actually injected into and can respond on.
 *
 * @param {string|undefined} url
 * @returns {boolean}
 */
function isYouTubeWatchUrl(url) {
  return Boolean(url) && url.includes(YOUTUBE_WATCH_URL_FRAGMENT);
}

/**
 * Resolves with the browser's currently active tab in the current
 * window. Wrapped as a Promise so callers can use async/await instead
 * of nesting further callbacks inside chrome.tabs.query's own
 * callback style.
 *
 * @returns {Promise<chrome.tabs.Tab|undefined>}
 */
function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

/**
 * Asks the content script on the given tab to fetch the current
 * video's transcript, resolving with its response.
 *
 * Wrapped as a Promise for the same reason as getActiveTab(). Also
 * guards against the case where no content script is listening at all
 * (e.g. the tab was closed, or the content script failed to load) —
 * chrome.runtime.lastError is set instead of a response arriving, and
 * without this check that shows up as a confusing crash deep inside
 * whatever tries to read a property off an undefined response.
 *
 * @param {number} tabId
 * @returns {Promise<{ transcript: object, videoTitle: string }|{ error: string }>}
 */
function requestTranscriptFromTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: ACTION_FETCH_TRANSCRIPT },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            error:
              "Couldn't reach the page's transcript reader. Try reloading the YouTube tab.",
          });
          return;
        }
        resolve(response);
      },
    );
  });
}

/**
 * Removes characters that are illegal (or risky) in filenames on
 * common operating systems, replacing them with a hyphen, and trims
 * stray whitespace left over at the edges.
 *
 * Illegal set covers Windows' restrictions specifically, since that's
 * the strictest common case: / \ : * ? " < > |
 *
 * @param {string} title
 * @returns {string}
 */
function sanitizeFilename(title) {
  return title.replace(/[/\\:*?"<>|]/g, "-").trim();
}

/**
 * Triggers a browser download of the given text as a file, tagging it
 * with the MIME type appropriate for the requested format.
 *
 * @param {string} text - the file's full contents.
 * @param {string} filename - the suggested filename, including extension.
 * @param {"txt"|"md"|"srt"} format
 */
function downloadTranscriptAsFile(text, filename, format) {
  const mimeType = FORMAT_MIME_TYPES[format] ?? "text/plain";
  const blob = new Blob([text], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  chrome.downloads.download({ url: objectUrl, filename }, () => {
    // The object URL only needs to live long enough for the download
    // API to read from it; release it once that call has completed
    // rather than leaking it for the rest of the popup's lifetime.
    URL.revokeObjectURL(objectUrl);
  });
}

/**
 * Reads the user's current format selection and timestamp preference
 * straight from the DOM.
 *
 * @returns {{ format: "txt"|"md"|"srt", includeTimestamps: boolean }}
 */
function readSelectedExportOptions() {
  const format = document.querySelector('input[name="format"]:checked').value;
  return { format, includeTimestamps: includeTimestampsCheckbox.checked };
}

/**
 * Enables the Download button only when the active tab is a YouTube
 * watch page — i.e. one extractor.js is actually able to respond on.
 * Runs once when the popup opens.
 */
async function initializeAvailability() {
  const activeTab = await getActiveTab();

  if (!isYouTubeWatchUrl(activeTab?.url)) {
    statusMessageEl.textContent = "Open a YouTube video to use Grammateus.";
    return;
  }

  downloadButton.disabled = false;
}

/**
 * Ensures extractor.js is loaded and its listener registered on the
 * given tab, regardless of whether the tab's original page-load
 * already had it injected. This guards against the case where the
 * extension was reloaded (e.g. during development, or an update)
 * while a matching tab was already open — Chrome does not retroactively
 * re-run content_scripts into tabs that predate the reload, which
 * otherwise leaves no listener there to receive messages at all.
 *
 * Safe to call on every click: extractor.js guards its own listener
 * registration against being added more than once per page.
 *
 * @param {number} tabId
 */
async function ensureExtractorInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content_scripts/extractor.js"],
  });
}

/**
 * SRT subtitles are always timestamped by definition, so the
 * "include timestamps" checkbox has nothing to toggle when SRT is
 * selected. Keep it disabled (and unchecked, so its state can't be
 * misread later) whenever SRT is the active format.
 */
function syncTimestampCheckboxToSelectedFormat() {
  const { format } = readSelectedExportOptions();
  const isSrtSelected = format === "srt";

  includeTimestampsCheckbox.disabled = isSrtSelected;
  if (isSrtSelected) {
    includeTimestampsCheckbox.checked = false;
  }
}

/**
 * Full click-to-download flow: fetch the transcript from the content
 * script, format it per the user's selection, and save it as a file.
 */
async function handleDownloadClick() {
  const { format, includeTimestamps } = readSelectedExportOptions();

  const activeTab = await getActiveTab();
  if (!activeTab) {
    statusMessageEl.textContent = "Couldn't find the active tab.";
    return;
  }

  statusMessageEl.textContent = "Fetching transcript…";

  await ensureExtractorInjected(activeTab.id);
  const response = await requestTranscriptFromTab(activeTab.id);

  if (!response || response.error) {
    statusMessageEl.textContent =
      response?.error ?? "Something went wrong fetching the transcript.";
    return;
  }

  const convert = FORMAT_CONVERTERS[format];
  const formattedText = convert(response.transcript.events, {
    includeTimestamps,
  });

  const filename = `${sanitizeFilename(response.videoTitle)}.${format}`;
  downloadTranscriptAsFile(formattedText, filename, format);

  statusMessageEl.textContent = "Downloaded!";
}

document
  .querySelector(".format-options")
  .addEventListener("change", syncTimestampCheckboxToSelectedFormat);

downloadButton.addEventListener("click", handleDownloadClick);

initializeAvailability();
