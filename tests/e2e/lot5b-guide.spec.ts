/* Lot 5B (5B-4) — conseils d'ergonomie par règles vérifiables, dans le vrai navigateur contre le Worker local (360 et 390 px).
   Seuils WCAG 2.2 lus sur w3.org le 17 novembre 2026 (docs/audits/preuves/lot5b/5b4-sources-w3c.txt). Aucune IA. */
import {test,expect,type Page} from './fixtures';
import {mkdirSync} from 'node:fs';
const ORIGIN='http://localhost:8787';
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});
const proof=async(loc:any,name:string)=>{mkdirSync('test-results/preuves',{recursive:true});await loc.screenshot({path:`test-results/preuves/${name}.png`,scale:'css',animations:'disabled'});};
const post=(page:Page,url:string,data:any)=>page.request.post(url,{data,headers:{Origin:ORIGIN}});

for(const width of [360,390])test(`Conseils : vérifier, accepter, refuser à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width,height:800});
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(`lot5b_guide_${width}_${Date.now().toString(36)}@example.test`);await page.locator('input[type="password"]').fill('test1234-lot5b');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const project=(await (await post(page,'/api/projects',{name:'Livre de recettes (essai)'})).json()).id;
 await page.reload();mkdirSync('test-results',{recursive:true});const shot=`test-results/lot5b-guide-capture-${width}.png`;await page.screenshot({path:shot});
 const mk=await (await post(page,'/api/mockups',{project_id:project,title:'Accueil',page_name:'Accueil'})).json();
 const open=async()=>{
  await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
  await page.getByText('Livre de recettes (essai)',{exact:true}).first().click();
  await page.locator('summary:has(> strong:text-is("Maquettes d’écran"))').click();await page.locator('details.fold:has(> summary:has-text("Accueil"))').first().locator('> summary').click();
 };
 await open();await page.locator('input[type="file"][accept="image/*"]').setInputFiles(shot);await expect(page.getByText(/^Capture enregistrée : /)).toBeVisible({timeout:30000});
 await page.request.put(`/api/mockups/${mk.id}/palette`,{data:{site:'recettes'},headers:{Origin:ORIGIN}});
 // une maquette avec des défauts réels : bouton minuscule, texte pâle, deux blocs qui se chevauchent
 for(const b of [{kind:'button',label:'Fermer',x:320,y:20,w:20,h:20},{kind:'text',label:'Astuce du jour',x:16,y:200,w:328,h:48,fill:'#ffffff',text_color:'#999999'},{kind:'card',label:'Recette A',x:16,y:300,w:200,h:120},{kind:'card',label:'Recette B',x:150,y:380,w:200,h:120}])
  expect((await post(page,`/api/mockups/${mk.id}/blocks`,b)).ok()).toBe(true);
 await page.reload();await open();
 const guide=page.locator('.mq-guide');
 await guide.getByRole('button',{name:'Vérifier la maquette'}).click();
 const tip=(t:string)=>guide.locator('.mq-tip',{hasText:t});
 await expect(tip('« Fermer » est trop petit pour le doigt')).toBeVisible();await expect(tip('« Fermer » est trop petit pour le doigt')).toContainText('✔ Vérifié');
 await expect(tip('« Fermer » est trop petit pour le doigt').getByRole('link',{name:/WCAG 2\.2, critère 2\.5\.8/})).toHaveAttribute('href','https://www.w3.org/TR/WCAG22/#target-size-minimum');
 await expect(tip('Le texte de « Astuce du jour » se lit mal')).toContainText('Contraste 2,84:1');
 await expect(tip('« Recette A » et « Recette B » se chevauchent')).toBeVisible();
 await expect(guide.locator('.mq-tip',{hasText:'hors palette du site'}).first()).toBeVisible();
 await noOverflow(page,'conseils '+width);expect(await smallText(page),'texte sous 12 px').toEqual([]);
 if(width===360)await proof(guide,'5b4-01-conseils-trouves');
 // refuser le contraste : il disparaît, et ne revient pas après rechargement
 await tip('Le texte de « Astuce du jour » se lit mal').getByRole('button',{name:'Refuser'}).click();
 await expect(guide.getByText('Refusé : « Le texte de « Astuce du jour » se lit mal » ne sera plus proposé.')).toBeVisible();
 await expect(tip('Le texte de « Astuce du jour » se lit mal')).toHaveCount(0);
 // accepter la taille : marqué, et sera dans la fiche
 await tip('« Fermer » est trop petit pour le doigt').getByRole('button',{name:'Accepter'}).click();
 await expect(tip('« Fermer » est trop petit pour le doigt')).toContainText('✔ Accepté : sera dans la fiche et la mission.');
 if(width===360)await proof(guide,'5b4-02-accepte-et-refuse');
 await page.reload();await open();await guide.getByRole('button',{name:'Vérifier la maquette'}).click();
 await expect(tip('« Fermer » est trop petit pour le doigt')).toContainText('Accepté');await expect(tip('Le texte de « Astuce du jour » se lit mal')).toHaveCount(0);
 await expect(guide.getByText(/1 refusé\(s\), masqué\(s\)/)).toBeVisible();
 // la fiche reprend le conseil accepté, pas le refusé
 await page.getByRole('button',{name:'Préparer la fiche'}).click();
 const sheet=page.locator('.mq-sheet');await sheet.locator('summary',{hasText:'Texte complet de la fiche'}).click();
 const md=await sheet.locator('pre').innerText();expect(md).toContain('Agrandis « Fermer » à au moins 24 × 24 px (WCAG 2.2, critère 2.5.8).');expect(md).not.toContain('Astuce du jour » : contraste');
 if(width===360)await proof(sheet.locator('pre'),'5b4-03-fiche-avec-conseil-accepte');
 // corriger la maquette fait disparaître le conseil
 const d=await (await page.request.get(`/api/mockups/${mk.id}`)).json();const f=d.blocks.find((x:any)=>x.label==='Fermer');
 expect((await post(page,`/api/mockups/${mk.id}/ops`,{revision:d.revision,ops:[{op:'update',id:f.id,patch:{x:300,w:44,h:44}}]})).ok()).toBe(true);
 await page.reload();await open();await guide.getByRole('button',{name:'Vérifier la maquette'}).click();
 await expect(tip('« Recette A » et « Recette B » se chevauchent')).toBeVisible();await expect(guide.locator('.mq-tip',{hasText:'« Fermer »'})).toHaveCount(0);
});
