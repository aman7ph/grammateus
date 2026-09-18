function toPlainText(events, options = { includeTimestamps: false }) {
  let textHolder = [];
  let doseItIncludeTimestamps = options["includeTimestamps"];
  for (const event of events) {
    if (!event["segs"]) {
      continue;
    }
    const isLineBreakEvent =
      event.segs.length === 1 && event.segs[0].utf8 === "\n";

    if (isLineBreakEvent) {
      textHolder.push("\n");
      continue;
    }
    const segments = event["segs"];
    let fragment = [];
    for (const segment of segments) {
      fragment.push(segment["utf8"]);
    }
    if (doseItIncludeTimestamps) {
      const timeStamp = formatTimestamp(event["tStartMs"]);
      fragment.unshift(timeStamp + " ");
    }
    textHolder.push(fragment.join(""));
  }
  return textHolder.join("");
}
function toMarkdown(events, options = { includeTimestamps: false }) {
  let textHolder = [];
  let doseItIncludeTimestamps = options["includeTimestamps"];
  for (const event of events) {
    if (!event["segs"]) {
      continue;
    }
    const isLineBreakEvent =
      event.segs.length === 1 && event.segs[0].utf8 === "\n";

    if (isLineBreakEvent) {
      textHolder.push("\n");
      continue;
    }
    const segments = event["segs"];
    let fragment = [];
    for (const segment of segments) {
      fragment.push(segment["utf8"]);
    }
    if (doseItIncludeTimestamps) {
      const timeStamp = `**${formatTimestamp(event["tStartMs"])}**`;
      fragment.unshift(timeStamp + " ");
    }
    textHolder.push(fragment.join(""));
  }
  return textHolder.join("");
}

function toSRT(events) {
  let textHolder = [];
  let counter = 1;
  for (const event of events) {
    if (!event["segs"]) {
      continue;
    }
    const isLineBreakEvent =
      event.segs.length === 1 && event.segs[0].utf8 === "\n";

    if (isLineBreakEvent) {
      continue;
    }
    const segments = event["segs"];
    let fragment = [];

    for (const segment of segments) {
      fragment.push(segment["utf8"]);
    }

    const startTimeStr = formatSrtTimestamp(event["tStartMs"]);
    const endTimeStr = formatSrtTimestamp(
      event["tStartMs"] + event["dDurationMs"],
    );
    const fragmentBlock = `${counter}\n${startTimeStr} --> ${endTimeStr}\n${fragment.join("")}\n\n`;
    textHolder.push(fragmentBlock);
    counter += 1;
  }
  return textHolder.join("");
}

function formatTimestamp(ms) {
  return `[${new Date(ms).toISOString().slice(11, 19)}]`;
}

function formatSrtTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  const timePart = [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");

  const msPart = milliseconds.toString().padStart(3, "0");

  return `${timePart},${msPart}`;
}
