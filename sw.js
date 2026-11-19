const V='edison-lab-v4',F=["./", "index.html", "lab.js", "worker.js", "ocgcore.sync.wasm", "cards.json", "strs.json", "presets.json", "efftype.json", "engine-cards.json", "scripts.json", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(F)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});
