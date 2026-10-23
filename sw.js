/* 萌萌切水果 - GitHub Pages Service Worker
 * 作用：把引擎压缩包（Intel.wasm.gz）与静态资源写入 Cache Storage，
 *      用户第二次进入时直接命中缓存，跳过 ~10 MB 的网络下载。
 * 缓存名带版本号，发布新版本后自动失效并重新下载。
 */
const CACHE_NAME = 'mengmeng-fruit-22581151';
const CACHE_PREFIX = 'mengmeng-fruit-';
/* 早期几版部署用过的缓存桶名。同一 origin 下所有 GitHub Pages 仓库共用存储配额，
 * 不清掉会白占约 90 MB。 */
const LEGACY_PREFIXES = ['intel-pages-cache-', '萌萌切水果-sw-cache-'];

function isStaleCache(name) {
	if (name === CACHE_NAME) {
		return false;
	}
	if (name.startsWith(CACHE_PREFIX)) {
		return true;
	}
	return LEGACY_PREFIXES.some(function (prefix) {
		return name.startsWith(prefix);
	});
}

/* 只预缓存页面自身要用到的小文件。
 * Intel.js / Intel.pck 在 Service Worker 安装前就已被页面下载，
 * 再预缓存一遍会造成重复下载；Intel.wasm.gz 由引擎在下载时写入缓存。 */
const CORE_ASSETS = [
	'./',
	'./index.html',
	'./Intel.png',
	'./Intel.icon.png',
	'./Intel.apple-touch-icon.png',
];

self.addEventListener('install', function (event) {
	event.waitUntil((async function () {
		const cache = await caches.open(CACHE_NAME);
		await Promise.all(CORE_ASSETS.map(function (url) {
			return cache.add(new Request(url, { cache: 'reload' })).catch(function (err) {
				console.warn('[sw] 预缓存失败：', url, err);
			});
		}));
		await self.skipWaiting();
	})());
});

self.addEventListener('activate', function (event) {
	event.waitUntil((async function () {
		const keys = await caches.keys();
		await Promise.all(keys.map(function (key) {
			if (isStaleCache(key)) {
				return caches.delete(key);
			}
			return Promise.resolve(false);
		}));
		await self.clients.claim();
	})());
});

async function cacheFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	const hit = await cache.match(request, { ignoreSearch: true });
	if (hit) {
		return hit;
	}
	const response = await fetch(request);
	if (response && response.ok && response.type === 'basic') {
		cache.put(request, response.clone()).catch(function () {});
	}
	return response;
}

async function networkFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	try {
		const response = await fetch(request);
		if (response && response.ok) {
			cache.put(request, response.clone()).catch(function () {});
		}
		return response;
	} catch (err) {
		const hit = await cache.match(request, { ignoreSearch: true });
		if (hit) {
			return hit;
		}
		const fallback = await cache.match('./index.html');
		if (fallback) {
			return fallback;
		}
		throw err;
	}
}

self.addEventListener('fetch', function (event) {
	const request = event.request;
	if (request.method !== 'GET') {
		return;
	}
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) {
		return;
	}
	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request));
		return;
	}
	event.respondWith(cacheFirst(request));
});