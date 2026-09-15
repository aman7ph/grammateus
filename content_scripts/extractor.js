(function () {
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }
    if (event.data?.type !== "YOUTUBE_CAPTIONS") {
      return;
    }
    const track = event.data?.tracks?.[0];
    const baseUrl = track["baseUrl"];
    const response = await fetch(baseUrl + "&fmt=json3");
    const text = await response.text();
    // console.log(`YOUTUBE_CAPTIONS ${response.status}, ${text}`);
  });
})();
