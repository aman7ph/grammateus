/**
 * format.js
 *
 * Pure, dependency-free transcript formatters. These functions take the
 * "events" array from a fetched YouTube caption track (see extractor.js)
 * and convert it into a downloadable format: plain text, Markdown, or SRT
 * subtitles. Nothing here touches chrome.* APIs or the DOM, so it can be
 * loaded into the popup, tested standalone, or reused elsewhere untouched.
 *
 * Expected shape of a single event, as returned by YouTube's timedtext
 * endpoint in json3 format:
 *   {
 *     tStartMs: number,      // when this caption appears, ms into the video
 *     dDurationMs: number,   // how long it stays visible, in ms
 *     segs: [{ utf8: string }, ...]
 *   }
 *
 * A small but important quirk of this data: a line break in the original
 * caption is represented as its OWN event, whose only segment is the
 * literal string "\n" — it is not embedded inside another event's text.
 * isLineBreakEvent() below is what detects that shape.
 */

/**
 * True if this event exists only to insert a line break, rather than
 * carrying real spoken content.
 *
 * @param {object} event
 * @returns {boolean}
 */
function isLineBreakEvent(event) {
  return event.segs.length === 1 && event.segs[0].utf8 === "\n";
}

/**
 * Concatenates every segment's text in an event into a single string.
 * Segments already carry their own leading spaces where needed (e.g.
 * "react", " has", " been"), so they are joined with no separator.
 *
 * @param {object} event
 * @returns {string}
 */
function joinEventText(event) {
  return event.segs.map((segment) => segment.utf8).join("");
}

/**
 * Formats a millisecond offset as a coarse, human-readable timestamp,
 * e.g. 6799 -> "[00:00:06]". Second-level precision only; see
 * formatSrtTimestamp() for the millisecond-precision variant SRT needs.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatTimestamp(ms) {
  return `[${new Date(ms).toISOString().slice(11, 19)}]`;
}

/**
 * Formats a millisecond offset as an SRT-spec timestamp, e.g.
 * 10800 -> "00:00:10,800". SRT requires millisecond precision and a
 * comma (not a period) before the milliseconds field.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatSrtTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const remainderMs = ms % 1000;

  const hhMmSs = [hours, minutes, seconds]
    .map((unit) => unit.toString().padStart(2, "0"))
    .join(":");

  return `${hhMmSs},${remainderMs.toString().padStart(3, "0")}`;
}

/**
 * Converts caption events into a flowing plain-text transcript.
 *
 * @param {Array<object>} events
 * @param {{ includeTimestamps?: boolean }} [options]
 * @returns {string}
 */
function toPlainText(events, options = { includeTimestamps: false }) {
  const includeTimestamps = options.includeTimestamps;
  const lines = [];

  for (const event of events) {
    if (!event.segs) {
      continue; // e.g. window-definition events with no text at all
    }

    if (isLineBreakEvent(event)) {
      lines.push("\n");
      continue;
    }

    const text = joinEventText(event);
    const prefix = includeTimestamps
      ? `${formatTimestamp(event.tStartMs)} `
      : "";
    lines.push(prefix + text);
  }

  return lines.join("");
}

/**
 * Converts caption events into a Markdown transcript. Structurally
 * identical to toPlainText(), but timestamps (when requested) are
 * rendered as bold Markdown rather than plain brackets.
 *
 * @param {Array<object>} events
 * @param {{ includeTimestamps?: boolean }} [options]
 * @returns {string}
 */
function toMarkdown(events, options = { includeTimestamps: false }) {
  const includeTimestamps = options.includeTimestamps;
  const lines = [];

  for (const event of events) {
    if (!event.segs) {
      continue;
    }

    if (isLineBreakEvent(event)) {
      lines.push("\n");
      continue;
    }

    const text = joinEventText(event);
    const prefix = includeTimestamps
      ? `**${formatTimestamp(event.tStartMs)}** `
      : "";
    lines.push(prefix + text);
  }

  return lines.join("");
}

/**
 * Converts caption events into SRT subtitle format.
 *
 * Line-break-only events carry no real content and are dropped entirely
 * rather than producing empty numbered blocks.
 *
 * YouTube's auto-generated (ASR) captions frequently have overlapping
 * tStartMs/dDurationMs ranges, since the live captioner continuously
 * re-estimates a rolling window rather than handing off cleanly between
 * lines. Most SRT players expect non-overlapping ranges, so each block's
 * end time is capped at the next block's start time whenever the natural
 * end would run past it.
 *
 * @param {Array<object>} events
 * @returns {string}
 */
function toSRT(events) {
  const realEvents = events.filter(
    (event) => event.segs && !isLineBreakEvent(event),
  );

  const blocks = realEvents.map((event, index) => {
    const startMs = event.tStartMs;
    const naturalEndMs = startMs + event.dDurationMs;

    const nextEvent = realEvents[index + 1];
    const endMs = nextEvent
      ? Math.min(naturalEndMs, nextEvent.tStartMs)
      : naturalEndMs;

    const sequenceNumber = index + 1;
    const timeRange = `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}`;
    const text = joinEventText(event);

    return `${sequenceNumber}\n${timeRange}\n${text}`;
  });

  // Each block is separated from the next by a blank line, per the SRT spec.
  return blocks.join("\n\n") + "\n\n";
}
