/* Lot 2 — audit de lisibilité : ouvre chaque rubrique à 360, 390 et 1280 px, mesure la plus petite taille de texte,
   le contraste (≥ 3:1), les cibles tactiles (≥ 24 px), le débordement horizontal et la présence de la ligne d'aide.
   Écrit un bilan dans test-results/lot2-audit-<ETIQUETTE>.json (ETIQUETTE = avant / apres). */
import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const LABEL=process.env.AUDIT_LABEL||'mesure';
const ORIGIN='http://localhost:8787';
async function register(page:Page,tag:string){
 const email=`lot2_${tag}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();
 await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot2');
 await page.locator('form button[type="submit"]').first().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 await page.request.post('/api/spaces/init',{data:{template:'sport'},headers:{Origin:ORIGIN}});
}
const ENTRY:Record<string,string>={Accueil:'Aujourd’hui','À traiter':'Aujourd’hui','Mes projets':'Projets',Pilotage:'Projets',Discussions:'Projets',Fichiers:'Projets',Activité:'Projets',Mémoire:'Savoir',Réglages:'Réglages et aide','Quotas Claude Code':'Réglages et aide',Aide:'Réglages et aide'};
/* Étape B : on ouvre l'entrée de la barre, puis l'onglet de l'écran s'il y en a plusieurs. */
async function open(page:Page,label:string){
 const entry=ENTRY[label]||label;
 await page.locator('.sidebar nav button',{hasText:entry}).first().click();
 const tabs=page.locator('.screen-tabs');
 if(await tabs.count()&&label!==entry)await tabs.getByRole('button',{name:label,exact:true}).click();
 await page.waitForTimeout(400);
}
const MEASURE=()=>{
 const parse=(c:string)=>{const m:string[]=c.match(/[\d.]+/g)||[];return {r:+(m[0]||0),g:+(m[1]||0),b:+(m[2]||0),a:m[3]===undefined?1:+m[3]};};
 const lum=({r,g,b}:any)=>{const f=(v:number)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
 const bgOf=(el:Element|null)=>{while(el){const c=parse(getComputedStyle(el).backgroundColor);if(c.a>0.9)return c;el=el.parentElement;}return {r:255,g:255,b:255,a:1};};
 const sizes:Record<string,number>={};const small:Record<string,number>={};const low:string[]=[];let minPx=99;let texts=0;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;
 while((n=walker.nextNode())){
  const t=(n.textContent||'').trim();if(!t)continue;const el=n.parentElement;if(!el)continue;
  if(['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName))continue;
  const cs=getComputedStyle(el),r=el.getBoundingClientRect();if(cs.visibility==='hidden'||cs.display==='none'||r.width===0||r.height===0)continue;
  if(el.closest('[aria-hidden="true"]'))continue;
  const px=parseFloat(cs.fontSize);if(px===0)continue;texts++;minPx=Math.min(minPx,px);sizes[px]=(sizes[px]||0)+1;
  if(px<12){const k=el.tagName.toLowerCase()+'.'+String(el.className).split(' ')[0]+' '+px+'px';small[k]=(small[k]||0)+1;}
  const fg=parse(cs.color),bg=bgOf(el),L1=lum(fg),L2=lum(bg),ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
  if(ratio<3&&fg.a>0.5)low.push(`${t.slice(0,30)} (${ratio.toFixed(2)})`);
 }
 const tiny:string[]=[];
 document.querySelectorAll('button,a[href],select,input:not([type=hidden]),summary').forEach(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);if(r.width===0||r.height===0||cs.visibility==='hidden')return;if(r.height<24||r.width<24)tiny.push((e.getAttribute('aria-label')||e.textContent||e.tagName).trim().slice(0,30)+` ${Math.round(r.width)}x${Math.round(r.height)}`);});
 return {texts,minPx,sizes,small,low:low.slice(0,10),lowCount:low.length,tiny:tiny.slice(0,10),tinyCount:tiny.length,overflow:document.documentElement.scrollWidth>innerWidth,
  h1:(document.querySelector('main h1,main h2')?.textContent||'').trim().slice(0,60),guide:!!document.querySelector('[data-guide]'),guideText:(document.querySelector('[data-guide]')?.textContent||'').slice(0,160)};
};
const MODULES=['Accueil','À traiter','Mes projets','Pilotage','Discussions','Fichiers','Activité','Mémoire','Réglages','Quotas Claude Code','Aide'];
test('audit de lisibilité des rubriques',async({page,browser})=>{
 test.setTimeout(240000);
 const out:any={etiquette:LABEL,date:new Date().toISOString(),largeurs:{}};
 await register(page,LABEL);
 const cookies=await page.context().cookies();
 for(const width of [360,390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:800},isMobile:width<500,hasTouch:width<500,baseURL:ORIGIN});await ctx.addCookies(cookies);
  const p=await ctx.newPage();await p.goto('/');await expect(p.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
  const rows:any[]=[];
  for(const dark of [false,true]){
   if(dark&&width!==360)continue;
   if(dark)await p.getByRole('button',{name:'Activer le thème sombre'}).click();
   for(const m of MODULES){await open(p,m);const r=await p.evaluate(MEASURE);rows.push({module:m,sombre:dark,...r});
    mkdirSync('test-results',{recursive:true});if(!dark)await p.screenshot({path:`test-results/lot2-${LABEL}-${m.replace(/\W/g,'')}-${width}.png`,fullPage:true});}
  }
  out.largeurs[width]=rows;await ctx.close();
 }
 mkdirSync('test-results',{recursive:true});writeFileSync(`test-results/lot2-audit-${LABEL}.json`,JSON.stringify(out,null,1));
 expect(true).toBe(true);
});
