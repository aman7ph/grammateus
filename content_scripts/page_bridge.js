(function () {
  try {
    const playerResponse = window.ytInitialPlayerResponse;

    if (!playerResponse) {
      console.error("ytInitialPlayerResponse not found on the page.");
      return;
    }

    const captions =
      playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captions || captions.length === 0) {
      console.log("No caption tracks found for this video.");
      return;
    }

    const payload = {
      type: "YOUTUBE_CAPTIONS",
      tracks: captions,
    };

    window.postMessage(payload, window.location.origin);
  } catch (error) {
    console.error("Error extracting or sending caption tracks:", error);
  }
})();
