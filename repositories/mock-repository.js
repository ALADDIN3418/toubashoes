/* Entity-neutral repository contract + Local Mock implementation. Replace this adapter, not views. */
(function(g){
 const COLLECTIONS={products:'products',productImages:'productImages',categories:'categories',orders:'orders',users:'users',profiles:'profiles',customers:'customers',addresses:'addresses',cart:'cart',coupons:'coupons',reviews:'reviews',banners:'banners',payments:'payments',pageContents:'pageContents',media:'media'};
 function keyOf(entity,row){if(entity==='siteSettings')return row.key;if(entity==='cart')return `${row.productId||row.id}::${row.size}::${row.color}`;return row.id??row.phone??row.code??row.slug}
 class RepositoryContract{async list(){throw new Error('list() must be implemented')}async getById(){throw new Error('getById() must be implemented')}async create(){throw new Error('create() must be implemented')}async update(){throw new Error('update() must be implemented')}async delete(){throw new Error('delete() must be implemented')}async search(){throw new Error('search() must be implemented')}async filter(){throw new Error('filter() must be implemented')}}
 class MockRepository extends RepositoryContract{
  constructor({state,entity,persist}){super();this.state=state;this.entity=entity;this.persist=persist}
  collection(){if(this.entity==='siteSettings')return Object.entries(this.state.settings||{}).map(([key,value])=>({key,value}));let key=COLLECTIONS[this.entity];if(!key)throw new Error(`Unknown repository: ${this.entity}`);this.state[key]||=[];return this.state[key]}
  key(row){return String(keyOf(this.entity,row))}
  async list(){return structuredClone(this.collection())}
  async getById(id){let row=this.collection().find(x=>this.key(x)===String(id));return row?structuredClone(row):null}
  async create(input){let rows=this.collection(),record=structuredClone(input);if(this.entity==='siteSettings'){this.state.settings[record.key]=record.value}else{if(!record.id&&this.entity!=='cart')record.id=`${this.entity.slice(0,3)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;if(rows.some(x=>this.key(x)===this.key(record)))throw new Error(`${this.entity} already exists`);if(['products','orders','reviews'].includes(this.entity))rows.unshift(record);else rows.push(record)}this.persist();return structuredClone(record)}
  async update(id,patch){if(this.entity==='siteSettings'){this.state.settings[id]=structuredClone(patch.value);this.persist();return{key:id,value:structuredClone(this.state.settings[id])}}let rows=this.collection(),at=rows.findIndex(x=>this.key(x)===String(id));if(at<0)throw new Error(`${this.entity} not found`);rows[at]={...rows[at],...structuredClone(patch)};this.persist();return structuredClone(rows[at])}
  async delete(id){if(this.entity==='siteSettings'){delete this.state.settings[id];this.persist();return true}let rows=this.collection(),at=rows.findIndex(x=>this.key(x)===String(id));if(at<0)return false;rows.splice(at,1);this.persist();return true}
  async search(query,fields=[]){let q=String(query||'').trim().toLocaleLowerCase('fa');if(!q)return this.list();return this.collection().filter(row=>(fields.length?fields:Object.keys(row)).some(k=>String(row[k]??'').toLocaleLowerCase('fa').includes(q))).map(row=>structuredClone(row))}
  async filter(criteria={}){let predicate=typeof criteria==='function'?criteria:row=>Object.entries(criteria).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):typeof value==='function'?value(row[key]):row[key]===value);return this.collection().filter(predicate).map(row=>structuredClone(row))}
 }
 function createRepositories(state,persist){let repos={};for(let name of [...Object.keys(COLLECTIONS),'siteSettings'])repos[name]=new MockRepository({state,entity:name,persist});return Object.freeze(repos)}
 g.RepositoryContract=RepositoryContract;g.MockRepository=MockRepository;g.createMockRepositories=createRepositories;
})(window);
