/* Lot 5B (5B-1) — maquettes d'écran : le parcours sur téléphone (360 et 390 px), joué dans le vrai navigateur contre le Worker local.
   La capture de départ est une VRAIE capture d'écran d'Atelier prise par le navigateur ; la compression en WebP est faite par le vrai Chromium.
   Les mesures (taille avant/après) sont écrites dans test-results/lot5b-mesures.json. Aucun glisser-déposer à cette étape (modification : 5B-2). */
import {test,expect,type Page} from './fixtures';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
const ORIGIN='http://localhost:8787';
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});
const measure=(o:Record<string,unknown>)=>{mkdirSync('test-results',{recursive:true});appendFileSync('test-results/lot5b-mesures.jsonl',JSON.stringify(o)+'\n');};

for(const width of [360,390])test(`Maquette : capture, blocs, lecture et écran de départ à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width,height:780});
 const email=`lot5b_${width}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot5b');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const proj=await page.request.post('/api/projects',{data:{name:'Livre de recettes (essai)'},headers:{Origin:ORIGIN}});expect(proj.ok()).toBe(true);const projectId=(await proj.json()).id;
 await page.reload();
 // une vraie capture : l'écran d'Atelier lui-même, pris par le navigateur (en double densité, comme un téléphone)
 mkdirSync('test-results',{recursive:true});
 const shot=`test-results/lot5b-capture-${width}.png`;
 const png=await page.screenshot({path:shot});
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
 await page.getByText('Livre de recettes (essai)',{exact:true}).first().click();
 await page.locator('summary:has(> strong:text-is("Maquettes d’écran"))').click();
 await expect(page.getByText('aucune maquette')).toBeVisible();
 await page.locator('summary:has(> strong:text-is("Nouvelle maquette"))').click();
 await page.getByLabel('Nom de la maquette').fill('Accueil du livre');await page.getByLabel('Page du site concernée (facultatif)').fill('Accueil');
 await page.getByRole('button',{name:'Créer la maquette'}).click();
 await expect(page.getByRole('heading',{name:'1. La capture de départ'})).toBeVisible();
 await noOverflow(page,'maquette sans capture '+width);

 // (1) la capture : réduite dans le navigateur, enregistrée, relue
 await page.locator('input[type="file"][accept="image/*"]').setInputFiles(shot);
 await expect(page.getByText(/^Capture enregistrée : \d+ × \d+ px, /)).toBeVisible({timeout:30000});
 const list=await (await page.request.get(`/api/mockups?project=${projectId}`)).json();const mk=list.items[0];
 expect(mk.has_image).toBe(true);expect(mk.image.mime).toBe('image/webp');expect(mk.image.bytes).toBeLessThanOrEqual(180000);expect(mk.screen_width).toBe(360);
 measure({width,original_png_bytes:png.length,original_px:`${width*2}x1560`,stored_mime:mk.image.mime,stored_bytes:mk.image.bytes,stored_px:`${mk.image.width}x${mk.image.height}`,screen_height:mk.screen_height});
 await expect(page.locator('.mq-bg')).toBeVisible();
 expect(await page.locator('.mq-bg').evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);

 // (2) poser trois blocs : ajout, puis position exacte par les « Détails » (aucun glisser dans ce test)
 const add=async(kind:string,label:string,x:string,y:string,w:string,h:string,extra:{group?:string;fill?:string}={})=>{
  await page.locator('.mq-add label.field:has(> span:text-is("Type")) select').selectOption(kind);await page.locator('.mq-add').getByLabel('Nom du bloc').fill(label);
  await page.locator('.mq-add').getByRole('button',{name:'Ajouter ce bloc'}).click();
  await expect(page.locator('.mq-panel strong').first()).toHaveText(label);
  const d=page.locator('.mq-panel');
  await d.getByLabel('Depuis la gauche').fill(x);await d.getByLabel('Depuis le haut').fill(y);await d.getByLabel('Largeur',{exact:true}).fill(w);await d.getByLabel('Hauteur',{exact:true}).fill(h);
  await d.getByRole('button',{name:'Appliquer les détails'}).click();
  await expect(d.locator('.mq-pad-c')).toHaveText(`${x} · ${y}`);
  if(extra.group){await d.getByLabel('Nom du groupe').fill(extra.group);await d.getByRole('button',{name:'Grouper le choix'}).click();await expect(d.getByText('Groupe(s) du choix : '+extra.group)).toBeVisible();}
  if(extra.fill){await d.getByLabel('Fond : autre couleur #rrggbb').fill(extra.fill);await d.getByRole('button',{name:'Autre couleur'}).first().click();}
 };
 await add('title','Titre de la page','16','60','328','40');
 await add('card','Carte recette','16','120','328','160',{group:'Contenu',fill:'#ffffff'});
 await add('bottom_bar','Barre du bas','0',String(mk.screen_height-60),'360','60');
 await expect(page.locator('.mq-block')).toHaveCount(3);
 // position en pourcentage de l'écran de travail : x=16/360, y=120/hauteur
 const box=await page.locator('.mq-block').nth(1).evaluate((e:HTMLElement)=>({l:e.style.left,t:e.style.top,w:e.style.width,h:e.style.height}));
 expect(parseFloat(box.l)).toBeCloseTo(16/360*100,1);expect(parseFloat(box.t)).toBeCloseTo(120/mk.screen_height*100,1);expect(parseFloat(box.w)).toBeCloseTo(328/360*100,1);
 const stage=await page.locator('.mq-stage').boundingBox();expect(stage!.width/stage!.height).toBeCloseTo(360/mk.screen_height,2);
 expect(stage!.width).toBeLessThanOrEqual(width);

 // (3) choisir un bloc : par la liste (sans viser un petit rectangle) puis au toucher ; le panneau montre ses réglages
 await page.locator('.mq-item',{hasText:'Carte recette'}).click();
 await expect(page.locator('.mq-panel strong').first()).toHaveText('Carte recette');await expect(page.locator('.mq-panel').getByText('Groupe(s) du choix : Contenu')).toBeVisible();
 await page.locator('.mq-block').first().click();await expect(page.locator('.mq-panel strong').first()).toHaveText('Titre de la page');
 const tap=await page.locator('.mq-item').first().boundingBox();expect(tap!.height).toBeGreaterThanOrEqual(44);

 // (4) refus lisible, en français : un bloc qui sort de l'écran
 const d2=page.locator('.mq-panel');await d2.getByLabel('Depuis la gauche').fill('100');await d2.getByLabel('Largeur',{exact:true}).fill('300');
 await d2.getByRole('button',{name:'Appliquer les détails'}).click();await expect(page.getByRole('alert')).toContainText('dépasse à droite');
 await expect(page.locator('.mq-block')).toHaveCount(3);

 // (5) le contexte du projet est montré, avec le niveau de fiabilité
 await expect(page.getByRole('heading',{name:'5. Ce qu’Atelier sait déjà de ce projet'})).toBeVisible();
 await expect(page.getByText('pas encore branchés')).toBeVisible();
 await noOverflow(page,'maquette avec blocs '+width);expect(await smallText(page),'texte sous 12 px').toEqual([]);
 await page.screenshot({path:`test-results/lot5b-maquette-${width}.png`,fullPage:true});

 // (6) fixer l'écran de départ : une seule fois ; la capture ne change plus, les blocs restent modifiables
 await page.getByRole('button',{name:'Fixer l’écran de départ'}).click();await page.getByRole('button',{name:/^Confirmer/}).last().click();
 await expect(page.getByText(/Écran de départ fixé le /)).toBeVisible();
 await expect(page.getByLabel('Remplacer la capture')).toHaveCount(0);await expect(page.locator('.mq-add').getByRole('button',{name:'Ajouter ce bloc'})).toBeVisible();
 await noOverflow(page,'écran de départ fixé '+width);
 await page.reload();await expect(page.getByText('aucune maquette')).toHaveCount(0);
});

test('Pire cas mesuré : bruit pur d’un écran accepté (réduit), page entière très longue refusée sans rien perdre',async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width:360,height:780});
 const email=`lot5b_pire_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot5b');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const proj=await page.request.post('/api/projects',{data:{name:'Projet pire cas'},headers:{Origin:ORIGIN}});const projectId=(await proj.json()).id;
 await page.request.post('/api/mockups',{data:{project_id:projectId,title:'Pire cas'},headers:{Origin:ORIGIN}});
 await page.reload();
 // bruit pur = image incompressible (pire cas pour la taille)
 const noiseFile=async(w:number,h:number,path:string)=>{const arr=await page.evaluate(async([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d')!;const d=x.createImageData(w,h);for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.random()*255;d.data[i+1]=Math.random()*255;d.data[i+2]=Math.random()*255;d.data[i+3]=255;}x.putImageData(d,0,0);const b:Blob=await new Promise(r=>c.toBlob(r as any,'image/png')) as Blob;return Array.from(new Uint8Array(await b.arrayBuffer()));},[w,h]);mkdirSync('test-results',{recursive:true});writeFileSync(path,Buffer.from(arr));return arr.length;};
 const screenPng=await noiseFile(720,1560,'test-results/lot5b-bruit-ecran.png');
 const tallPng=await noiseFile(540,4680,'test-results/lot5b-bruit-page-entiere.png');
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
 await page.getByText('Projet pire cas',{exact:true}).first().click();
 await page.locator('summary:has(> strong:text-is("Maquettes d’écran"))').click();await page.locator('details.fold:has(> summary:has-text("Pire cas"))').first().locator('> summary').click();
 const input=page.locator('input[type="file"][accept="image/*"]');
 // 1) bruit pur d'un écran : le navigateur réduit jusqu'à 360 px et ça tient
 await input.setInputFiles('test-results/lot5b-bruit-ecran.png');
 await expect(page.getByText(/^Capture enregistrée : /)).toBeVisible({timeout:120000});
 const ok=(await (await page.request.get(`/api/mockups?project=${projectId}`)).json()).items[0];
 expect(ok.has_image).toBe(true);expect(ok.image.bytes).toBeLessThanOrEqual(180000);
 measure({case:'bruit pur d’un écran 720x1560',png_bytes:screenPng,stored_mime:ok.image.mime,stored_bytes:ok.image.bytes,stored_px:`${ok.image.width}x${ok.image.height}`});
 // 2) page entière très longue en bruit : refusée, message clair, la capture précédente reste intacte
 await input.setInputFiles('test-results/lot5b-bruit-page-entiere.png');
 await expect(page.getByRole('alert')).toContainText('dépasse 180 Ko',{timeout:120000});await expect(page.getByRole('alert')).toContainText('un seul écran');
 const after=(await (await page.request.get(`/api/mockups?project=${projectId}`)).json()).items[0];
 expect(after.image.bytes).toBe(ok.image.bytes);expect(after.image.width).toBe(ok.image.width);
 measure({case:'bruit pur d’une page entière 540x4680',png_bytes:tallPng,result:'refusé dans le navigateur ; capture précédente intacte'});
 await noOverflow(page,'capture refusée');
});
