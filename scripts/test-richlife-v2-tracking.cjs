const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tracking = fs.readFileSync('pages/richlife/tracking.js','utf8');
const pixel = fs.readFileSync('public/js/meta-pixel.js','utf8');
function boot(search='',store=new Map(),options={}) {
 const events=[],requests=[],pixelEvents=[],listeners={},cookies=new Map();
 const form={addEventListener(type,fn){listeners['form:'+type]=fn;}};
 const document={title:'Richlife',referrer:'https://example.com/ad',readyState:'complete',hidden:false,
 documentElement:{scrollHeight:2000},querySelector(sel){return sel==='#registration-form'?form:null;},
 addEventListener(type,fn){listeners['doc:'+type]=fn;},
 createElement(){return {};},getElementsByTagName(){return [{parentNode:{insertBefore(){}}}];}};
 Object.defineProperty(document,'cookie',{get:()=>[...cookies].map(([k,v])=>k+'='+v).join('; '),set:value=>{const [key,...rest]=value.split(';')[0].split('=');cookies.set(key,rest.join('='));}});
 const context={document,location:{pathname:options.thanks?'/richlife-v2/thank-you':'/richlife-v2',search,href:'https://event.phamthanhbien.com/richlife-v2'+search,protocol:'https:'},
 sessionStorage:{getItem:k=>{if(options.blockStorage)throw Error('blocked');return store.get(k)},setItem:(k,v)=>{if(options.blockStorage)throw Error('blocked');store.set(k,v)}},
 navigator:{sendBeacon:(url,body)=>{events.push(body);return options.beacon!==false;}},
 fetch:async(url,config)=>{requests.push({url,config});return {ok:true,json:async()=>({enabled:true,pixel_id:'TEST_PIXEL'})};},
 Blob,URLSearchParams,Date,Math,JSON,Set,Promise,console,crypto:require('node:crypto').webcrypto,
 setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,10)),clearTimeout,innerHeight:1000,scrollY:500,
 addEventListener(type,fn){listeners['window:'+type]=fn;},
 fbq:(...args)=>pixelEvents.push(args)};
 context.window=context;
 vm.createContext(context); vm.runInContext(tracking,context); vm.runInContext(pixel,context);
 return {context,events,requests,pixelEvents,listeners,store};
}
(async()=>{
 const a=boot('?utm_source=facebook&utm_campaign=richlife&fbclid=TESTCLICK&gclid=G&ttclid=T&msclkid=M&twclid=W');
 await new Promise(r=>setTimeout(r,20));
 const page=JSON.parse(await a.events[0].text());
 assert.equal(page.event,'pageview');assert.equal(page.data.page_id,'richlife-v2');
 assert.equal(a.pixelEvents.find(e=>e[1]==='PageView')[3].eventID,page.data.event_id);
 const payload=a.context.RichlifeTracking.context();
 for(const k of ['session_id','fbc','fbp','utm_source','utm_campaign','fbclid','gclid','ttclid','msclkid','twclid'])assert.ok(payload[k],k);
 assert.match(payload.fbc,/TESTCLICK$/);
 a.listeners['form:focusin']();
 a.context.RichlifeTracking.track('form_submit');
 a.listeners['doc:click']({target:{closest:()=>({href:'https://zalo.me/g/example',getAttribute:()=>null,closest:()=>null})}});
 a.listeners['window:scroll']();a.listeners['window:scroll']();
 await a.context.RichlifeTracking.registered({event_id:'lead-123'});
 assert.equal(a.pixelEvents.filter(e=>e[1]==='CompleteRegistration').length,1);
 assert.equal(a.pixelEvents.find(e=>e[1]==='CompleteRegistration')[3].eventID,'lead-123');
 assert.equal(a.pixelEvents.find(e=>e[1]==='CompleteRegistration')[2].value,0);
 const serverEvents=await Promise.all(a.events.map(async x=>JSON.parse(await x.text())));
 for(const event of ['form_open','form_submit','cta_click','Scroll_25_Percent','Scroll_50_Percent'])assert.ok(serverEvents.some(e=>e.event===event),event);
 assert.equal(serverEvents.filter(e=>e.event==='Scroll_50_Percent').length,1);
 assert.ok(!serverEvents.some(e=>e.event==='conversion'),'no second server conversion');
 const b=boot('',a.store,{thanks:true});await new Promise(r=>setTimeout(r,20));
 assert.equal(b.context.RichlifeTracking.context().utm_source,'facebook');
 assert.equal(b.context.RichlifeTracking.context().ttclid,'T');
 assert.ok(!b.pixelEvents.some(e=>e[1]==='CompleteRegistration'),'no duplicate conversion on thank-you');
 const pending=new Map([['richlife_v2_pending_conversion',JSON.stringify({id:'lead-pending',at:Date.now()})]]);
 const c=boot('',pending,{thanks:true});await new Promise(r=>setTimeout(r,20));
 assert.equal(c.pixelEvents.find(e=>e[1]==='CompleteRegistration')[3].eventID,'lead-pending');
 const d=boot('?fbclid=NEWCLICK',a.store,{blockStorage:true,beacon:false});await new Promise(r=>setTimeout(r,20));
 assert.ok(d.requests.some(r=>r.url==='/api/track'));
 assert.match(d.context.RichlifeTracking.context().fbc,/NEWCLICK$/);
 assert.ok(!JSON.stringify(serverEvents).includes('assets'));
 console.log('PASS: PageView browser/server ID, session/cookies, all click IDs, attribution persistence, form/CTA/scroll events, conversion dedup, thank-you retry, blocked storage and beacon fallback; no financial input tracking.');
})().catch(e=>{console.error(e);process.exitCode=1;});
