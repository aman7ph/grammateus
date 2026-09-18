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

function formatTimestamp(ms) {
  return `[${new Date(ms).toISOString().slice(11, 19)}]`;
}
