'use strict';
/* Unit/integration harness for Supabase commerce mapping and durable repository writes. */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const ids = {
  admin:'00000000-0000-4000-8000-000000000001',
  customer:'00000000-0000-4000-8000-000000000002',
  category:'10000000-0000-4000-8000-000000000001',
  product:'20000000-0000-4000-8000-000000000001',
  variant:'30000000-0000-4000-8000-000000000001',
  order:'40000000-0000-4000-8000-000000000001',
  cart:'50000000-0000-4000-8000-000000000001'
};

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.action = 'select';
    this.filters = [];
    this.payload = null;
    this.conflict = '';
    this.singleResult = false;
    this.allowNull = false;
  }
  select() { return this; }
  order() { return this; }
  eq(column, value) { this.filters.push(row => row[column] === value); return this; }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload) { this.action = 'update'; this.payload = payload; return this; }
  upsert(payload, options = {}) { this.action = 'upsert'; this.payload = payload; this.conflict = options.onConflict || 'id'; return this; }
  delete() { this.action = 'delete'; return this; }
  single() { this.singleResult = true; return this; }
  maybeSingle() { this.singleResult = true; this.allowNull = true; return this; }
  matches(row) { return this.filters.every(predicate => predicate(row)); }
  generatedId() {
    this.client.sequence += 1;
    return `90000000-0000-4000-8000-${String(this.client.sequence).padStart(12,'0')}`;
  }
  async execute() {
    const rows = this.client.tables[this.table] ||= [];
    let result = [];
    if (this.action === 'select') {
      result = rows.filter(row => this.matches(row));
    } else if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(input => ({
        id:input.id || this.generatedId(), created_at:new Date().toISOString(), updated_at:new Date().toISOString(), ...structuredClone(input)
      }));
      rows.push(...inserted);
      result = inserted;
    } else if (this.action === 'update') {
      result = rows.filter(row => this.matches(row)).map(row => Object.assign(row, structuredClone(this.payload), {updated_at:new Date().toISOString()}));
    } else if (this.action === 'upsert') {
      const keys = this.conflict.split(',').map(value => value.trim()).filter(Boolean);
      const inputs = Array.isArray(this.payload) ? this.payload : [this.payload];
      result = inputs.map(input => {
        const found = rows.find(row => keys.every(key => row[key] === input[key]));
        if (found) return Object.assign(found, structuredClone(input), {updated_at:new Date().toISOString()});
        const created = {id:input.id || this.generatedId(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...structuredClone(input)};
        rows.push(created);
        return created;
      });
    } else if (this.action === 'delete') {
      const removed = rows.filter(row => this.matches(row));
      this.client.tables[this.table] = rows.filter(row => !this.matches(row));
      result = removed;
    }
    if (this.singleResult) {
      if (!result.length && this.allowNull) return {data:null,error:null};
      if (result.length !== 1) return {data:null,error:{code:'PGRST116',message:'single row expected'}};
      return {data:structuredClone(result[0]),error:null};
    }
    return {data:structuredClone(result),error:null};
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

function fakeClient() {
  const client = {
    sequence:0,
    rpcCalls:[],
    storageUploads:[],
    storageRemovals:[],
    tables:{
      categories:[{id:ids.category,slug:'boots',name:'بوت',description:'',image_url:null,icon:'◈',sort_order:1,is_active:true,created_at:'2026-10-01T00:00:00.000Z'}],
      products:[{id:ids.product,slug:'real-shoe',name:'کفش ثبت‌شده',short_description:'توضیح',description:'شرح محصول',brand:'طوبی',sku:'TB-DB-1',price_toman:1250000,compare_at_price_toman:1400000,is_active:true,is_featured:true,is_best_seller:false,features:['راحت'],specifications:{جنس:'چرم'},category_id:ids.category,created_at:'2026-10-01T00:00:00.000Z'}],
      product_variants:[{id:ids.variant,product_id:ids.product,size:'۴۰',color:'مشکی',sku:'TB-DB-1-40',stock:6,price_toman:null}],
      product_images:[{id:'60000000-0000-4000-8000-000000000001',product_id:ids.product,url:'https://cdn.example.test/shoe.jpg',alt:'کفش',sort_order:0}],
      site_settings:[{key:'storeName',value:'فروشگاه واقعی طوبی',is_public:true},{key:'phone',value:'۰۹۱۲۱۲۳۴۵۶۷',is_public:true},{key:'shipping',value:80000,is_public:true},{key:'freeShipping',value:2000000,is_public:true},{key:'shippingOptions',value:{normal:80000,express:160000,freeFrom:2000000},is_public:true},{key:'homepage',value:{categoryIds:[ids.category],featuredProductIds:[ids.product],bestSellerProductIds:[],advantages:[]},is_public:true}],
      banners:[],page_contents:[],reviews:[],media:[],profiles:[{id:ids.admin,email:'owner@example.test',display_name:'مدیر',phone:'09120000000',role:'super_admin',is_active:true,created_at:'2026-10-01T00:00:00.000Z'}],
      orders:[{id:ids.order,number:'TB-TEST-1',user_id:ids.admin,status:'CONFIRMED',shipping_method:'normal',tracking_code:'TRK-1',status_history:[],coupon_code_snapshot:null,address_snapshot:{recipient:'مدیر',phone:'09120000000',province:'تهران',city:'تهران',address:'آدرس ثبت‌شده',postal_code:'1234567890'},subtotal_toman:1250000,shipping_toman:80000,discount_toman:0,total_toman:1330000,created_at:'2026-10-01T00:00:00.000Z'}],
      order_items:[{id:'70000000-0000-4000-8000-000000000001',order_id:ids.order,product_id:ids.product,variant_id:ids.variant,product_name_snapshot:'کفش ثبت‌شده',sku_snapshot:'TB-DB-1',variant_label_snapshot:'سایز ۴۰، مشکی',unit_price_toman:1250000,quantity:1}],
      payments:[{id:'80000000-0000-4000-8000-000000000001',order_id:ids.order,provider:'bitpay',status:'verified',amount_toman:1330000,authority:'123',provider_reference:'9001',provider_code:'PAID',failure_reason:null,created_at:'2026-10-01T00:00:00.000Z'}],
      addresses:[],coupons:[],user_favorites:[],carts:[],cart_items:[],newsletter_subscribers:[]
    },
    from(table) { return new FakeQuery(this,table); },
    async rpc(name,args) {
      this.rpcCalls.push({name,args:structuredClone(args||{})});
      if (name === 'set_cart_item_quantity') {
        const userId=context.ToubaAuth.currentUser.id;
        let cart=this.tables.carts.find(row=>row.user_id===userId);
        if (!cart) { cart={id:ids.cart,user_id:userId}; this.tables.carts.push(cart); }
        const current=this.tables.cart_items.find(row=>row.cart_id===cart.id&&row.variant_id===args.p_variant_id);
        if (args.p_quantity===0) this.tables.cart_items=this.tables.cart_items.filter(row=>row!==current);
        else if (current) current.quantity=args.p_quantity;
        else this.tables.cart_items.push({id:'70000000-0000-4000-8000-000000000099',cart_id:cart.id,variant_id:args.p_variant_id,quantity:args.p_quantity});
        return {data:{variantId:args.p_variant_id,quantity:args.p_quantity},error:null};
      }
      if (name === 'admin_update_order_status') return {data:{status:args.p_status},error:null};
      if (name === 'admin_set_profile_active') return {data:{is_active:args.p_is_active},error:null};
      throw new Error(`Unexpected RPC: ${name}`);
    },
    storage:{
      from(bucket) {
        assert.equal(bucket,'product-images');
        return {
          async upload(filePath,bytes,options) { client.storageUploads.push({filePath,bytes:bytes.length,options}); return {data:{path:filePath},error:null}; },
          getPublicUrl(filePath) { return {data:{publicUrl:`https://storage.example.test/${filePath}`}}; },
          async remove(filePaths) { client.storageRemovals.push(...filePaths); return {data:filePaths,error:null}; }
        };
      }
    }
  };
  return client;
}

const context = {
  console,Date,Math,Intl,URL,structuredClone,atob,
  ToubaAuth:{currentUser:{id:ids.admin,role:'super_admin',authProvider:'supabase'}},
  window:null
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'repositories/supabase-repository.js'),'utf8'),context,{filename:'repositories/supabase-repository.js'});
vm.runInContext(fs.readFileSync(path.join(root,'services/application-services.js'),'utf8'),context,{filename:'services/application-services.js'});

async function main() {
  const client=fakeClient();
  const state={products:[],categories:[],cart:[],orders:[],customers:[],coupons:[],reviews:[],banners:[],media:[],settings:{},users:[],profiles:[],payments:[],pageContents:[],addresses:[],productImages:[],favorites:[]};
  const data=await context.SupabaseRepositories.loadState(client,state);
  assert.equal(data.products[0].id,ids.product);
  assert.equal(data.products[0].price,1250000);
  assert.equal(data.products[0].variants[0].stock,6);
  assert.deepEqual(JSON.parse(JSON.stringify(data.products[0].images)),['https://cdn.example.test/shoe.jpg']);
  assert.equal(data.categories[0].name,'بوت');
  assert.equal(data.settings.storeName,'فروشگاه واقعی طوبی');
  assert.equal(data.settings.phone,'۰۹۱۲۱۲۳۴۵۶۷');
  assert.equal(data.orders[0].paymentStatus,'PAID');
  assert.equal(data.orders[0].total,1330000);
  assert.equal(data.customers[0].role,'super_admin');
  assert.equal(data.customers[0].orders,1);
  assert.equal(data.customers[0].total,1330000);

  const shipping=new context.AppServices.ShippingService(data.settings);
  assert.equal(shipping.quote('normal',100000),80000);
  assert.equal(shipping.quote('express',100000),160000);
  assert.equal(shipping.quote('free',2000000),0);
  assert.throws(()=>shipping.quote('free',1999999),/مشمول ارسال رایگان نیست/);
  assert.throws(()=>shipping.quote('unknown',100000),/روش ارسال معتبر نیست/);
  const zeroThresholdShipping=new context.AppServices.ShippingService({shipping:12000,freeShipping:50000,shippingOptions:{}});
  assert.equal(zeroThresholdShipping.quote('express',100000),12000);
  assert.equal(zeroThresholdShipping.options(0).find(option=>option.id==='free').available,false);
  assert.equal(zeroThresholdShipping.options(50000).find(option=>option.id==='free').available,true);
  const freeAtZero=new context.AppServices.ShippingService({shippingOptions:{freeFrom:0}});
  assert.equal(freeAtZero.quote('free',0),0);
  const liveDb={settings:data.settings},emptyRepo={};
  const liveServices=context.AppServices.create({products:emptyRepo,productImages:emptyRepo,orders:emptyRepo,users:emptyRepo,customers:emptyRepo,cart:emptyRepo,coupons:emptyRepo,reviews:emptyRepo,banners:emptyRepo,siteSettings:emptyRepo,media:emptyRepo,payments:emptyRepo,favorites:emptyRepo,newsletterSubscribers:emptyRepo,contactMessages:emptyRepo},{db:liveDb});
  assert.equal(liveServices.shipping.quote('normal',100000),80000);
  liveDb.settings={shippingOptions:{normal:123000,express:234000,freeFrom:999999}};
  assert.equal(liveServices.shipping.quote('normal',100000),123000,'shipping service should read newly hydrated DB settings, not a stale state object');
  assert.equal(liveServices.shipping.quote('express',100000),234000);

  const repositories=context.SupabaseRepositories.create(client,data);
  const category=await repositories.categories.create({slug:'sandals',name:'صندل',icon:'◈',active:true,sortOrder:2});
  assert.match(category.id,/^[0-9a-f-]{36}$/i);
  await repositories.categories.update(category.id,{name:'صندل زنانه'});
  assert.equal(client.tables.categories.find(row=>row.id===category.id).name,'صندل زنانه');

  const banner=await repositories.banners.create({title:'بنر آزمون',subtitle:'متن ثبت‌شده در پایگاه داده',imageUrl:'https://cdn.example.test/banner.jpg',linkUrl:'/shop',buttonText:'مشاهده',position:'home-promo',sortOrder:1,active:true});
  assert.equal(client.tables.banners[0].title,'بنر آزمون');
  await repositories.banners.update(banner.id,{title:'بنر ویرایش‌شده',active:false});
  assert.equal(client.tables.banners[0].title,'بنر ویرایش‌شده');
  assert.equal(client.tables.banners[0].is_active,false);
  await repositories.banners.delete(banner.id);
  assert.equal(client.tables.banners.length,0);

  await repositories.products.update(ids.product,{price:1300000,variants:[{id:ids.variant,size:'۴۰',color:'مشکی',sku:'TB-DB-1-40',stock:9}]});
  assert.equal(client.tables.products.find(row=>row.id===ids.product).price_toman,1300000);
  assert.equal(client.tables.product_variants.find(row=>row.id===ids.variant).stock,9);
  assert.equal(data.products[0].price,1300000);

  await repositories.siteSettings.update('phone',{value:'۰۹۱۲۹۹۹۹۹۹۹'});
  assert.equal(client.tables.site_settings.find(row=>row.key==='phone').value,'۰۹۱۲۹۹۹۹۹۹۹');

  context.ToubaAuth.currentUser={id:ids.customer,role:'customer',authProvider:'supabase'};
  data.cart=[];
  await repositories.cart.create({id:ids.product,variantId:ids.variant,size:'۴۰',color:'مشکی',qty:2});
  assert.equal(client.rpcCalls.at(-1).name,'set_cart_item_quantity');
  assert.equal(client.rpcCalls.at(-1).args.p_quantity,2);
  assert.equal(data.cart[0].qty,2);

  await assert.rejects(()=>repositories.orders.create({total:1}),/اتمیک Supabase/);
  await assert.rejects(()=>repositories.payments.create({}),/فقط توسط سرور/);

  context.ToubaAuth.currentUser={id:ids.admin,role:'super_admin',authProvider:'supabase'};
  const image=Buffer.alloc(24,7).toString('base64');
  const dataUrl=`data:image/png;base64,${image}`;
  const media=await repositories.media.create({url:dataUrl,alt:'تصویر تولیدشده'});
  assert.equal(client.storageUploads.length,1);
  assert.equal(media.url.startsWith('https://storage.example.test/'),true);
  assert.equal(client.tables.media.length,1);
  const attached=await repositories.productImages.create({productId:ids.product,url:dataUrl,alt:'تصویر محصول',sortOrder:1});
  assert.equal(client.storageUploads.length,2);
  assert.equal(attached.productId,ids.product);
  assert.equal(data.products[0].images.length,2);

  console.log('PASS: Supabase row hydration, paid-order/customer totals, persistent catalog/settings/cart writes, fail-closed order/payment mutations, and Storage-backed AI/product images');
}

main().catch(error=>{console.error(error);process.exit(1);});
