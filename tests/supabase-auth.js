'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

(async () => {
  const calls = {};
  let authCallback;
  let sessionAvailable=false;
  const profile = { id:'user-1', email:'shopper@example.com', display_name:'مشتری طوبی', phone:null, role:'customer', is_active:true };
  const session = { access_token:'test-only-access', refresh_token:'test-only-refresh', user:{ id:'user-1', email:'shopper@example.com', user_metadata:{ display_name:'مشتری طوبی' } } };
  const client = {
    auth: {
      async getSession(){ return { data:{ session:sessionAvailable?session:null }, error:null }; },
      onAuthStateChange(callback){ authCallback=callback; return { data:{ subscription:{ unsubscribe(){} } } }; },
      async signUp(input){ calls.signUp=input; return { data:{ session:null, user:{id:'user-2'} }, error:null }; },
      async signInWithPassword(input){ calls.signIn=input; sessionAvailable=true; return { data:{ session, user:session.user }, error:null }; },
      async resetPasswordForEmail(email, options){ calls.reset={email,options}; return {error:null}; },
      async updateUser(input){ calls.updateUser=input; return {error:null}; },
      async signOut(){ calls.signOut=true; sessionAvailable=false; return {error:null}; }
    },
    from(table){
      assert.equal(table,'profiles');
      return { select(fields){ calls.profileFields=fields; return { eq(column,value){ calls.profileFilter=[column,value]; return { async single(){calls.profileReads=(calls.profileReads||0)+1;return {data:profile,error:null};} }; } }; } };
    }
  };
  const window={
    TOUBA_PUBLIC_CONFIG:{enabled:true,url:'https://project-ref.supabase.co',anonKey:'public-test-key'},
    supabase:{createClient(url,key,options){calls.client={url,key,options};return client;}},
    location:{origin:'https://shop.example',pathname:'/login'},
    setTimeout,
    console
  };
  const context={window,console,setTimeout,URLSearchParams,Promise,Error,String,Boolean,Number,RegExp,Date,JSON,Object,Array};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../services/supabase-auth.js'),'utf8'),context);
  const auth=window.ToubaAuth;
  assert.equal(auth.configured,true);
  assert.equal(calls.client.url,'https://project-ref.supabase.co');
  assert.equal(calls.client.key,'public-test-key');
  assert.equal(calls.client.options.auth.flowType,'pkce');
  const registration=await auth.signUp({email:' New@Example.com ',password:'long-secure-password',displayName:'مشتری'});
  assert.equal(registration.confirmationRequired,true);
  assert.equal(calls.signUp.email,'new@example.com');
  assert.equal(calls.signUp.options.data.display_name,'مشتری');
  assert.equal(calls.signUp.options.emailRedirectTo,'https://shop.example/login?verified=1');
  const user=await auth.signIn({email:'SHOPPER@example.com',password:'long-secure-password'});
  assert.equal(user.id,'user-1');
  assert.equal(user.role,'customer');
  assert.equal(user.authProvider,'supabase');
  assert.equal(calls.profileFilter[1],'user-1');
  assert.equal(await auth.getAccessToken(),'test-only-access','admin API requests can reuse the authenticated Supabase session token');
  sessionAvailable=false;
  const removedKeys=[];
  window.db={currentUser:{id:'cached-demo-admin',role:'super_admin',authProvider:'demo'}};
  window.localStorage={removeItem(key){removedKeys.push(key);}};
  await auth.start();
  assert.equal(window.db.currentUser,null,'Supabase mode clears cached local/demo identities');
  assert(removedKeys.includes('touba_admin_session'),'legacy local admin bypass key is removed');
  const profileReadsBeforeEvents=calls.profileReads;
  authCallback('SIGNED_IN',session);
  authCallback('INITIAL_SESSION',session);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(calls.profileReads,profileReadsBeforeEvents,'already handled Auth events must not trigger a duplicate profile read');
  await auth.sendPasswordReset('shopper@example.com');
  assert.equal(calls.reset.options.redirectTo,'https://shop.example/reset-password');
  assert.equal(auth.publicError({message:'Invalid login credentials'}),'ایمیل یا رمز عبور درست نیست.');

  const originalEnv={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,anon:process.env.SUPABASE_ANON_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL='https://project-ref.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY='public-browser-key';
  process.env.SUPABASE_ANON_KEY='';
  process.env.SUPABASE_SERVICE_ROLE_KEY='never-expose-this';
  const api=require('../api/supabase-config.js');
  const headers={};
  const response={setHeader(k,v){headers[k]=v;},end(body){this.body=body;}};
  api({method:'GET'},response);
  assert.equal(response.statusCode,200);
  assert.match(response.body,/public-browser-key/);
  assert.doesNotMatch(response.body,/never-expose-this/);
  assert.match(response.body,/"enabled":true/);
  /* a privileged key pasted into the public slot must never reach the browser */
  const secretJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.sig`;
  process.env.SUPABASE_PUBLISHABLE_KEY = secretJwt;
  response.body = '';
  api({ method: 'GET' }, response);
  assert.doesNotMatch(response.body, /eyJ/, 'a service_role JWT must not be echoed to the browser');
  assert.match(response.body, /"enabled":false/, 'and the storefront then reports the config as unusable');
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_test_value';
  response.body = '';
  api({ method: 'GET' }, response);
  assert.doesNotMatch(response.body, /sb_secret_test_value/, 'the sb_secret_ prefix is refused too');
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-browser-key';
  for(const [k,v] of [['SUPABASE_URL',originalEnv.url],['SUPABASE_PUBLISHABLE_KEY',originalEnv.key],['SUPABASE_ANON_KEY',originalEnv.anon],['SUPABASE_SERVICE_ROLE_KEY',originalEnv.service]]) {
    if(v===undefined) delete process.env[k]; else process.env[k]=v;
  }
  const uiApp={innerHTML:'',insertAdjacentHTML(position,html){this.innerHTML=html+this.innerHTML;}};
  let uiAuthenticatedUser=null;
  let submittedCredentials=null;
  const uiAuth={configured:true,client:{},get currentUser(){return uiAuthenticatedUser;},set currentUser(value){uiAuthenticatedUser=value;},start:async()=>null,publicError:()=> 'auth error',signIn:async credentials=>{submittedCredentials=credentials;uiAuthenticatedUser={id:'admin-1',email:credentials.email,name:'مدیر',role:'super_admin',isActive:true,authProvider:'supabase'};return uiAuthenticatedUser;},signUp:async()=>{},sendPasswordReset:async()=>{},updatePassword:async()=>{},signOut:async()=>{uiAuthenticatedUser=null;}};
  const uiWindow={
    ToubaAuth:uiAuth,
    db:{currentUser:{id:'cached-demo-admin',role:'super_admin',authProvider:'demo'}},
    __TOUBA_DATABASE_READY:true,
    DataProvider:{state:{status:'ready'},load:async(_store,target)=>target,refresh:async(_store,target)=>target},
    location:{pathname:'/login',search:'?mode=signup',origin:'https://shop.example'},
    document:{body:{classList:{remove(){}}},querySelector(selector){return selector==='#app'?uiApp:null;}},
    history:null,
    header:()=>'<header/>',footer:()=>'</footer>',esc:value=>String(value),toast:value=>{uiWindow.lastToast=value;},go:value=>{uiWindow.lastGo=value;},
    render:null,login:null,loginUser:null,demoLogin:null,adminLogin:null,logout:null,account:null,ordersPage:null,
    setTimeout,URLSearchParams
  };
  uiWindow.history={pushState(_state,_title,target){const parsed=new URL(target,uiWindow.location.origin);uiWindow.location.pathname=parsed.pathname;uiWindow.location.search=parsed.search;uiWindow.lastPush=target;}};
  uiWindow.render=function(){uiApp.innerHTML=uiWindow.login();};
  class MockFormData{constructor(form){this.fields=form.fields}get(key){return this.fields[key]}}
  const uiContext={window:uiWindow,URLSearchParams,FormData:MockFormData,setTimeout,Promise,console};
  vm.createContext(uiContext);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../services/auth-ui.js'),'utf8'),uiContext);
  assert.match(uiApp.innerHTML,/ساخت حساب کاربری/);
  assert.match(uiApp.innerHTML,/name="email"/);
  uiWindow.location.search='';uiWindow.render();
  assert.match(uiApp.innerHTML,/placeholder="ایمیل حساب کاربری"/);
  assert.doesNotMatch(uiApp.innerHTML,/admin@toubashoes\.ir/);
  const submitButton={disabled:false,textContent:'ورود',dataset:{}};
  const loginForm={fields:{email:'owner@example.com',password:'strong-password'},querySelector(){return submitButton;}};
  await uiWindow.ToubaAuthUI.signIn(loginForm);
  assert.equal(submittedCredentials.email,'owner@example.com');
  assert.equal(submittedCredentials.password,'strong-password','admin-like email still requires real password authentication');
  assert.equal(uiWindow.lastPush,'/admin');
  assert.match(uiApp.innerHTML,/پنل امن Supabase/);
  uiWindow.location.pathname='/admin';uiWindow.location.search='';uiWindow.render();
  assert.match(uiApp.innerHTML,/پنل امن Supabase/);
  assert.match(uiApp.innerHTML,/مدیریت طوبی/);
  uiAuthenticatedUser=null;
  uiWindow.render();
  assert.match(uiApp.innerHTML,/ورود به حساب کاربری/,'cached demo-admin state alone must not unlock the Supabase admin panel');
  uiWindow.ToubaAuthUI.quickAdminLogin();
  assert.equal(uiAuthenticatedUser,null,'quick admin login must not create an authenticated session');
  uiWindow.demoLogin('admin');
  assert.match(uiWindow.lastToast,/غیرفعال است/);
  console.log('PASS: Supabase auth/profile, admin-like email requires password, no cached/quick-admin bypass, no admin email in login UI');
})().catch(error=>{console.error(error);process.exit(1);});
