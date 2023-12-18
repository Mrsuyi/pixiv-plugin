// Latest ID of get_urls msg from pixiv new_illust page.
let msg_id = 0;

// 404 URLs.
let urls_404 = new Set();

// Load existing URLs from browser local storage.
// Merge with new URLs.
// Filter out visited URLs.
// Save URLs to local storage and return.
const syncUrls = async (id, new_urls) => {
  let old_urls = (await chrome.storage.sync.get('urls')).urls || [];
  if (id < msg_id) return [];

  urls = new Set([...new_urls, ...old_urls]);
  for (const url of urls_404) urls.delete(url);
  urls = [...urls];
  let res = [];

  // Check if visited.
  for (url of urls) {
    if (id < msg_id) return [];
    let visits = await chrome.history.getVisits({url: url});
    if (visits.length == 0) res.push(url);
  }
  chrome.action.setBadgeText({text: res.length.toString()});
  if (id < msg_id) return [];

  await chrome.storage.sync.set({urls: res});
  return res;
};

chrome.action.onClicked.addListener(async (tab) => {
  let urls = await syncUrls(Number.MAX_SAFE_INTEGER, []);
  chrome.windows.create({
    focused: true,
    state: 'normal',
    url: urls,
  });
  // Update URLs after 10s.
  setTimeout(async () => {
    syncUrls(Number.MAX_SAFE_INTEGER, []);
    // Clear 404 URLs after 3s.
    setTimeout(() => urls_404.clear(), 3 * 1000);
  }, 10 * 1000);
});

// Message from get_urls. Use an incremental msg_id to avoid conflicts between
// multiple events.
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (sender.tab == null) return;
  syncUrls(++msg_id, request.urls);
});

// Get URLs from new_illust tab.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const tar_url = 'https://www.pixiv.net/bookmark_new_illust.php';
  if (changeInfo.status != 'complete' ||
      tab.url.substring(0, tar_url.length) != tar_url)
    return;

  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: async () => {
      // Get URLs from the image container.
      let get_urls = async () => {
        console.log('Get URLs from image container');
        let imgs = document.getElementsByClassName(
            'sc-9y4be5-2 sc-9y4be5-3 sc-1wcj34s-1 kFAPOq JaPty');
        let urls = [];

        for (let i = 0; i < imgs.length; ++i) {
          let img = imgs[i];
          let a = img.getElementsByTagName('a')[0];
          urls.push(a.href);
        }
        console.log(urls);
        chrome.runtime.sendMessage({urls: urls});
      };

      // Observe image container and try get_urls.
      let cnt = 100;
      let check_page = async () => {
        let img_hub = document.getElementsByClassName('sc-jgyytr-0 buukZm');
        if (img_hub.length == 0) {
          if (--cnt > 0) {
            setTimeout(check_page, 100);
          } else {
            console.log('Cannot find image container');
          }
          return;
        }
        await get_urls();

        // Add observer in case the container updates later.
        let observer = new MutationObserver(get_urls);
        let config = {attributes: true, childList: true, subtree: true};
        observer.observe(img_hub[0], config);
      };
      check_page();
    },
  });
});

// Remove 404 URL because Chrome doesn't record them in the history.
chrome.webRequest.onCompleted.addListener((details) => {
  if (details.statusCode === 404) {
    console.log('Remove 404 URL: ' + details.url);
    urls_404.add(details.url);
  }
}, {types: ['main_frame'], urls: ['https://www.pixiv.net/artworks/*']});

syncUrls(Number.MAX_SAFE_INTEGER, []);

// Manually clean up the local storage.
// chrome.storage.sync.set({urls: []});
