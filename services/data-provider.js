/* Provider selection is local/demo-only. No network or Supabase SDK is loaded here. */
(function(g){
 const publicConfig=g.TOUBA_PUBLIC_CONFIG||{};
 const config=Object.freeze({DATA_PROVIDER:'mock',SUPABASE_URL:publicConfig.url||'',SUPABASE_ANON_KEY:publicConfig.anonKey||'',AUTH_PROVIDER:publicConfig.enabled?'supabase':publicConfig.configured?'misconfigured':'demo'});
 class LocalPersistenceAdapter{
  constructor(storage){this.storage=storage}
  load(key,seed){try{const raw=this.storage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&Object.keys(parsed).length>0)return parsed}}catch(e){console.warn('Mock storage is corrupt; using a fresh demo seed.',e)}const fresh=structuredClone(seed);this.save(key,fresh);return fresh}
  save(key,value){
    try { this.storage.setItem(key,JSON.stringify(value)); } catch(e){}
    if (typeof fetch === 'function' && typeof window !== 'undefined' && window.location?.origin) {
      try {
        fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: value })
        }).catch(() => {});
      } catch(e) {}
    }
    return value;
  }
  clear(key){this.storage.removeItem(key)}
  reset(key,seed){this.clear(key);return this.load(key,seed)}
  has(key){return !!this.storage.getItem(key)}
 }
 const persistence=new LocalPersistenceAdapter(g.localStorage);
 g.APP_ENV=config;
 g.DataProvider={name:config.DATA_PROVIDER,hydrate:(key,seed)=>persistence.load(key,seed),persist:(key,value)=>persistence.save(key,value),clear:key=>persistence.clear(key),reset:(key,seed)=>persistence.reset(key,seed),has:key=>persistence.has(key),LocalPersistenceAdapter};
 if (typeof fetch === 'function' && typeof window !== 'undefined' && window.location?.origin) {
   setTimeout(async () => {
     try {
       const res = await fetch('/api/db');
       if (res.ok) {
         const json = await res.json();
         if (json && json.success && json.data && json.data.products && json.data.products.length > 0) {
           if (typeof g.db !== 'undefined' && g.db) {
             g.db.products = json.data.products;
             g.db.categories = json.data.categories || g.db.categories;
             g.db.orders = json.data.orders || g.db.orders;
             g.db.coupons = json.data.coupons || g.db.coupons;
             if (json.data.settings) g.db.settings = Object.assign({}, g.db.settings, json.data.settings);
             try { g.localStorage.setItem('toubashop-v1', JSON.stringify(g.db)); } catch(e){}
             if (typeof g.render === 'function') g.render();
           }
         }
       }
     } catch(e) {}
   }, 50);
 }
})(window);
