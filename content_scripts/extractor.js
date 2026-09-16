/**
 * extractor.js (ISOLATED world content script)
 *
 * Fetches a YouTube video's transcript by querying the InnerTube API
 * as the ANDROID client, then downloading the chosen caption track.
 *
 * WHY THE ANDROID CLIENT: YouTube's default WEB client now requires a
 * PoToken (proof-of-origin token) on caption requests. Without one, the
 * timedtext endpoint returns an empty HTTP 200 body instead of an error.
 * The ANDROID client is not subject to this restriction, so we ask
 * InnerTube for the video's data "as if" we were the Android app, which
 * hands back caption URLs that work with a plain fetch().
 */

// Public InnerTube API key used by ANDROID-family clients. This is not a
// secret or a per-user credential — it is a fixed constant embedded in the
// public Android YouTube app binary, and is used openly by open-source
// projects such as yt-dlp and youtube-transcript-api.
const INNERTUBE_ANDROID_API_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const INNERTUBE_PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player";
const INNERTUBE_ANDROID_CLIENT_VERSION = "20.10.38";

/**
 * Reads the YouTube video ID out of the current tab's URL.
 * Works because YouTube watch pages always carry it as ?v=<id>.
 *
 * @returns {string|null} the video ID, or null if not present.
 */
function getCurrentVideoId() {
  return new URLSearchParams(window.location.search).get("v");
}

/**
 * Asks YouTube's InnerTube /player endpoint for this video's data,
 * pretending to be the Android app client so the response's caption
 * URLs are not gated behind a PoToken.
 *
 * @param {string} videoId
 * @returns {Promise<object>} the parsed InnerTube player response.
 * @throws {Error} if the network request fails or returns a non-OK status.
 */
async function fetchPlayerResponseAsAndroidClient(videoId) {
  const requestBody = {
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: INNERTUBE_ANDROID_CLIENT_VERSION,
      },
    },
    videoId: videoId,
  };

  const response = await fetch(INNERTUBE_PLAYER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": INNERTUBE_ANDROID_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(
      `InnerTube player request failed with HTTP ${response.status}`,
    );
  }

  return response.json();
}

/**
 * Pulls the list of available caption tracks out of an InnerTube player
 * response. Returns null if the video has no captions at all.
 *
 * @param {object} playerResponse
 * @returns {Array<object>|null}
 */
function extractCaptionTracks(playerResponse) {
  const tracks =
    playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!tracks || tracks.length === 0) {
    return null;
  }

  return tracks;
}

/**
 * Downloads a single caption track's contents as structured JSON.
 *
 * Caption track baseUrls come back with "fmt=srv3" (an XML format) by
 * default; we swap that for "fmt=json3" so we get back clean structured
 * JSON instead of XML, which is simpler to parse downstream.
 *
 * @param {string} captionTrackBaseUrl
 * @returns {Promise<object>} parsed transcript JSON, shaped like
 *   { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }, ...] }
 * @throws {Error} if the network request fails or returns a non-OK status.
 */
async function fetchTranscriptJson(captionTrackBaseUrl) {
  const jsonFormatUrl = captionTrackBaseUrl.replace("fmt=srv3", "fmt=json3");
  const response = await fetch(jsonFormatUrl);

  if (!response.ok) {
    throw new Error(`Transcript fetch failed with HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Entry point: fetches the transcript for the video on the current page
 * and logs it. Currently selects the first available caption track;
 * language/track selection will be exposed to the user later.
 */
async function main() {
  const videoId = getCurrentVideoId();

  if (!videoId) {
    console.error("[Grammateus] Could not find a video ID in the page URL.");
    return;
  }

  try {
    const playerResponse = await fetchPlayerResponseAsAndroidClient(videoId);
    const captionTracks = extractCaptionTracks(playerResponse);

    if (!captionTracks) {
      console.log("[Grammateus] This video has no caption tracks.");
      return;
    }

    // TODO: let the user choose a track/language instead of always
    // taking the first one in the list.
    const selectedTrack = captionTracks[0];
    const transcript = await fetchTranscriptJson(selectedTrack.baseUrl);

    console.log("[Grammateus] Transcript fetched successfully:");
    console.log(JSON.stringify(transcript, null, 2));
  } catch (error) {
    console.error("[Grammateus] Failed to fetch transcript:", error);
  }
}

main();
