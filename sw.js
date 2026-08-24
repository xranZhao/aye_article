// 阿野写作 Service Worker
// 提供离线缓存和后台上传功能

const CACHE_NAME = 'aye-writer-v4';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// 安装：预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存优先（离线可用）
self.addEventListener('fetch', (event) => {
  // 不缓存 API 请求
  if (event.request.url.includes('api.deepseek.com') || event.request.url.includes('api.github.com')) {
    return; // 直接走网络
  }

  // HTML 始终优先拉取线上新版；断网时才退回已缓存的页面。
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        // 只缓存成功的 GET 请求
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// 后台同步：监听网络恢复后的上传
self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-pending') {
    event.waitUntil(uploadPendingArticles());
  }
});

// 后台上传（此版本为简化实现，完整版需要 IndexedDB 在 SW 中的支持）
async function uploadPendingArticles() {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'RETRY_UPLOAD' });
  });
}
