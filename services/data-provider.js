/* Provider selection is local/demo-only. No network or Supabase SDK is loaded here. */
(function(g){
 const config=Object.freeze({DATA_PROVIDER:'mock',SUPABASE_URL:'',SUPABASE_ANON_KEY:''});
 class LocalPersistenceAdapter{
  constructor(storage){this.storage=storage}
  load(key,seed){try{const raw=this.storage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&Object.keys(parsed).length>0)return parsed}}catch(e){console.warn('Mock storage is corrupt; using a fresh demo seed.',e)}const fresh=structuredClone(seed);this.save(key,fresh);return fresh}
  save(key,value){this.storage.setItem(key,JSON.stringify(value));return value}
  clear(key){this.storage.removeItem(key)}
  reset(key,seed){this.clear(key);return this.load(key,seed)}
  has(key){return !!this.storage.getItem(key)}
 }
 const persistence=new LocalPersistenceAdapter(g.localStorage);
 g.APP_ENV=config;
 g.DataProvider={name:config.DATA_PROVIDER,hydrate:(key,seed)=>persistence.load(key,seed),persist:(key,value)=>persistence.save(key,value),clear:key=>persistence.clear(key),reset:(key,seed)=>persistence.reset(key,seed),has:key=>persistence.has(key),LocalPersistenceAdapter};
})(window);
