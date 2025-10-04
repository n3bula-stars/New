// dumb hack to allow firefox to work (please dont do this in prod)
if (navigator.userAgent.includes("Firefox")) {
	Object.defineProperty(globalThis, "crossOriginIsolated", {
		value: true,
		writable: false,
	});
}

importScripts("/scram/scramjet.all.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

async function handleRequest(event) {
	await scramjet.loadConfig();
	if (scramjet.route(event)) {
		return scramjet.fetch(event);
	}

	return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
	event.respondWith(handleRequest(event));
});

let playgroundData;
self.addEventListener("message", ({ data }) => {
	if (data.type === "playgroundData") {
		playgroundData = data;
	}
});

function isYouTubeURL(url) {
	return (
		url.includes("youtube.com") ||
		url.includes("youtu.be") ||
		url.includes("googlevideo.com")
	);
}

scramjet.addEventListener("request", (e) => {
	if (playgroundData && e.url.href.startsWith(playgroundData.origin)) {
		const headers = {};
		const origin = playgroundData.origin;

		if (e.url.href === origin + "/") {
			headers["content-type"] = "text/html";

			let html = playgroundData.html;

			if (isYouTubeURL(e.url.href)) {
				const youtubeReloadSnippet = `
<script>
new MutationObserver(() => {
  if (
    document.querySelector('div.ytp-error-content-wrap-subreason a[href*="www.youtube.com/watch?v="]')
  ) location.reload();
}).observe(document.body, { childList: true, subtree:true });
</script>
`;
				if (html.includes("</body>")) {
					html = html.replace("</body>", youtubeReloadSnippet + "</body>");
				} else {
					html += youtubeReloadSnippet;
				}
			}

			e.response = new Response(html, { headers });
		} else if (e.url.href === origin + "/style.css") {
			headers["content-type"] = "text/css";
			e.response = new Response(playgroundData.css, { headers });
		} else if (e.url.href === origin + "/script.js") {
			headers["content-type"] = "application/javascript";
			e.response = new Response(playgroundData.js, { headers });
		} else {
			e.response = new Response("empty response", { headers });
		}

		e.response.rawHeaders = headers;
		e.response.rawResponse = {
			body: e.response.body,
			headers: headers,
			status: e.response.status,
			statusText: e.response.statusText,
		};
		e.response.finalURL = e.url.toString();
	} else {
		return;
	}
});
