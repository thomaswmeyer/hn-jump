// Strip the parts of a URL that commonly differ between the address bar and
// what was submitted to HN (scheme, www., trailing slash, fragment).
function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return host + path + u.search;
  } catch {
    return rawUrl;
  }
}

async function findHnDiscussion(pageUrl) {
  const api = new URL("https://hn.algolia.com/api/v1/search");
  api.searchParams.set("query", normalizeUrl(pageUrl));
  api.searchParams.set("restrictSearchableAttributes", "url");
  api.searchParams.set("hitsPerPage", "20");

  const res = await fetch(api);
  if (!res.ok) throw new Error(`Algolia API returned ${res.status}`);
  const data = await res.json();

  const target = normalizeUrl(pageUrl);
  const matches = (data.hits || []).filter(
    (hit) => hit.url && normalizeUrl(hit.url) === target
  );
  if (matches.length === 0) return null;

  // Prefer the discussion with the most points, then most comments.
  matches.sort(
    (a, b) =>
      (b.points || 0) - (a.points || 0) ||
      (b.num_comments || 0) - (a.num_comments || 0)
  );
  return matches[0];
}

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !/^https?:/.test(tab.url)) {
    flashBadge("n/a", "#999999");
    return;
  }

  // Don't look up HN pages themselves.
  if (new URL(tab.url).hostname === "news.ycombinator.com") return;

  flashBadge("...", "#ff6600");
  try {
    const hit = await findHnDiscussion(tab.url);
    if (hit) {
      chrome.action.setBadgeText({ text: "" });
      await chrome.tabs.create({
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        index: tab.index + 1,
      });
    } else {
      flashBadge("0", "#999999");
    }
  } catch (e) {
    console.error("HN lookup failed:", e);
    flashBadge("err", "#cc0000");
  }
});
