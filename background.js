let msg_id = 0;

let syncUrls = async (id, urls) => {
  let old_urls = (await chrome.storage.sync.get('urls')).urls;
  if (id < msg_id) {
    return [];
  }
  if (!old_urls) old_urls = [];
  urls = [...new Set([...urls, ...old_urls])];
  let new_urls = [];
  for (url of urls) {
    if (id < msg_id) {
      return [];
    }
    let visits = await chrome.history.getVisits({url: url});
    if (visits.length == 0) new_urls.push(url);
  }
  chrome.action.setBadgeText({text: new_urls.length.toString()});
  if (id < msg_id) {
    return [];
  }
  await chrome.storage.sync.set({urls: new_urls});
  return new_urls;
};

// chrome.storage.sync.set({urls: []});

chrome.action.onClicked.addListener(async (tab) => {
  let urls = await syncUrls(Number.MAX_SAFE_INTEGER, []);
  chrome.windows.create({
    focused: true,
    state: 'normal',
    url: urls,
  });
  setTimeout(async () => syncUrls(Number.MAX_SAFE_INTEGER, []), 10000);
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (sender.tab == null) return;
  syncUrls(++msg_id, request.urls);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const tar_url = 'https://www.pixiv.net/bookmark_new_illust.php';
  if (changeInfo.status != 'complete' ||
      tab.url.substring(0, tar_url.length) != tar_url)
    return;

  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: async () => {
      let load_imgs = async () => {
        console.log('Reload img list');
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

      let cnt = 100;
      let check_page = async () => {
        let img_hub = document.getElementsByClassName('sc-jgyytr-0 buukZm');
        if (img_hub.length == 0) {
          if (--cnt > 0) {
            setTimeout(check_page, 100);
          }
          return;
        }
        await load_imgs();
        let observer = new MutationObserver(load_imgs);
        let config = {attributes: true, childList: true, subtree: true};
        observer.observe(img_hub[0], config);
      };
      check_page();
    },
  });
});

syncUrls(Number.MAX_SAFE_INTEGER, []);
