/* Lot 5B (5B-3) — fiche de mise en page, image et mission, dans le vrai navigateur contre le Worker local (360 et 390 px).
   Le dépôt d'essai est inséré dans la base locale : AUCUN appel à GitHub (la lecture des vraies règles du dépôt reste NON PROUVÉE ici). */
import {test,expect,type Page} from './fixtures';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,copyFileSync} from 'node:fs';
const ORIGIN='http://localhost:8787';
const sql=(q:string)=>execFileSync('npx',['wrangler','d1','execute','atelier-db','--local','--command',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});
const proof=async(loc:any,name:string)=>{mkdirSync('test-results/preuves',{recursive:true});await loc.screenshot({path:`test-results/preuves/${name}.png`,scale:'css',animations:'disabled'});};
const post=(page:Page,url:string,data:any)=>page.request.post(url,{data,headers:{Origin:ORIGIN}});

for(const width of [360,390])test(`Fiche, image et mission à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width,height:800});
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(`lot5b_fiche_${width}_${Date.now().toString(36)}@example.test`);await page.locator('input[type="password"]').fill('test1234-lot5b');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const init=await post(page,'/api/spaces/init',{template:'livre_recettes'});expect(init.ok()).toBe(true);const project=(await init.json()).project_id as string;
 const me=(await (await page.request.get('/api/auth/me')).json()).user.id as string,at=new Date().toISOString(),conn=crypto.randomUUID(),repo=crypto.randomUUID();
 sql(`INSERT INTO connections(id,user_id,provider,label,secret,created_at) VALUES('${conn}','${me}','github','gh essai','x','${at}');INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch) VALUES('${repo}','${me}','${project}','${conn}','martinznt/Livre-de-recettes','main','${'0'.repeat(40)}','${at}','main');`);
 await page.reload();mkdirSync('test-results',{recursive:true});const shot=`test-results/lot5b-fiche-capture-${width}.png`;await page.screenshot({path:shot});
 const mk=await (await post(page,'/api/mockups',{project_id:project,title:'Accueil du livre',page_name:'Accueil'})).json();
 // ouvrir la maquette et déposer la vraie capture par l'écran
 const open=async()=>{
  await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
  await page.getByText('Livre de recettes',{exact:true}).first().click();
  await page.locator('summary:has(> strong:text-is("Maquettes d’écran"))').click();await page.locator('details.fold:has(> summary:has-text("Accueil du livre"))').first().locator('> summary').click();
 };
 await open();await page.locator('input[type="file"][accept="image/*"]').setInputFiles(shot);await expect(page.getByText(/^Capture enregistrée : /)).toBeVisible({timeout:30000});
 // blocs de départ, écran de départ fixé, puis modifications (déplacer sous, grouper, colorier) : par l'API pour aller vite, l'écran a été prouvé en 5B-2
 await page.request.put(`/api/mockups/${mk.id}/palette`,{data:{site:'recettes'},headers:{Origin:ORIGIN}});
 for(const [label,y,x,w] of [['Titre',40,16,328],['Recherche',300,16,328],['Ajouter',600,16,150],['Partager',600,190,150]] as [string,number,number,number][])
  expect((await post(page,`/api/mockups/${mk.id}/blocks`,{kind:'button',label,x,y,w,h:40})).ok()).toBe(true);
 expect((await post(page,`/api/mockups/${mk.id}/lock-start`,{})).ok()).toBe(true);
 let d=await (await page.request.get(`/api/mockups/${mk.id}`)).json();const id=(l:string)=>d.blocks.find((x:any)=>x.label===l).id;
 expect((await post(page,`/api/mockups/${mk.id}/ops`,{revision:d.revision,ops:[{op:'update',id:id('Recherche'),patch:{y:88}},{op:'group',ids:[id('Ajouter'),id('Partager')],name:'Actions'},{op:'update',id:id('Ajouter'),patch:{fill:'#d39a62'}}]})).ok()).toBe(true);
 await page.reload();await open();

 // (1) préparer la fiche : écarts, liste de contrôle, fichiers en hypothèse
 await page.getByRole('button',{name:'Préparer la fiche'}).click();
 const sheet=page.locator('.mq-sheet');
 await expect(sheet.locator('.mq-list li').getByText('Déplace « Recherche » juste sous « Titre » (position visée : 16 px du bord gauche, 88 px du haut ; avant : 16, 300).',{exact:true})).toBeVisible();
 await expect(sheet.locator('.mq-list li').getByText('« Ajouter » et « Partager » sont ensemble (groupe « Actions »).',{exact:true})).toBeVisible();
 await expect(sheet.locator('.mq-list li').getByText(/Couleur de fond de « Ajouter » : --accent \(#d39a62\)/)).toBeVisible();
 await expect(sheet.locator('code',{hasText:'public/css/app.css'})).toBeVisible();await expect(sheet.locator('h5',{hasText:'Fichiers probablement concernés'}).getByText('(Hypothèse)')).toBeVisible();
 await noOverflow(page,'fiche '+width);expect(await smallText(page),'texte sous 12 px').toEqual([]);
 if(width===360)await proof(sheet,'5b3-01-fiche-ecarts-controle');

 // (2) télécharger la fiche : le fichier contient bien les consignes
 const [dl]=await Promise.all([page.waitForEvent('download'),sheet.getByRole('button',{name:'Télécharger la fiche'}).click()]);
 expect(dl.suggestedFilename()).toBe('fiche-accueil-du-livre.md');const md=readFileSync(await dl.path(),'utf8');
 expect(md).toMatch(/^# Fiche de mise en page — Accueil du livre/);expect(md).toContain('Déplace « Recherche » juste sous « Titre »');expect(md).toContain('- [ ] « Ajouter » et « Partager » sont ensemble (groupe « Actions »).');
 if(width===360){mkdirSync('test-results/preuves',{recursive:true});copyFileSync(await dl.path(),'test-results/preuves/5b3-02-fiche-telechargee.md');}

 // (3) télécharger l'image de la maquette : un vrai PNG à la taille de l'écran de travail × 2
 const [im]=await Promise.all([page.waitForEvent('download'),sheet.getByRole('button',{name:'Télécharger l’image'}).click()]);
 const png=readFileSync(await im.path());expect(png.subarray(1,4).toString()).toBe('PNG');
 expect(png.readUInt32BE(16)).toBe(720);expect(png.readUInt32BE(20)).toBe(d.screen_height*2);
 if(width===360)copyFileSync(await im.path(),'test-results/preuves/5b3-03-image-maquette.png');

 // (4) créer la mission (générateur du lot 3), la figer sans les règles (pas de GitHub ici), la télécharger
 await sheet.getByRole('button',{name:'Créer la mission'}).click();await expect(sheet.getByText(/Mission « Maquette : Accueil du livre » créée en brouillon/)).toBeVisible();
 await page.locator('summary:has(> strong:text-is("Missions pour Claude Code"))').click();
 await page.locator('details.fold:has(> summary:has-text("Maquette : Accueil du livre"))').first().locator('> summary').click();
 await expect(page.getByText('Aperçu exact du texte')).toBeVisible();
 await page.getByLabel(/Préparer quand même sans les règles du dépôt/).check();await page.getByRole('button',{name:'Préparer la mission (figer le texte)'}).click();
 await expect(page.getByText('Mission figée : « Prête à copier ».')).toBeVisible();
 const [ms]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Télécharger',exact:true}).click()]);
 await expect(page.getByText('Texte téléchargé. Le statut est « Exportée ».')).toBeVisible();
 const mission=readFileSync(await ms.path(),'utf8');
 expect(mission).toContain('Déplace « Recherche » juste sous « Titre »');expect(mission).toContain('Hypothèse (liste des fichiers du dépôt au commit 92ec7c5');expect(mission).toMatch(/règles du dépôt|CLAUDE\.md|AGENTS\.md/i);
 if(width===360){copyFileSync(await ms.path(),'test-results/preuves/5b3-04-mission-telechargee.md');await proof(page.locator('details:has(> summary:text-is("Texte figé (identique à ce qui est copié)"))').first(),'5b3-05-mission-figee');}
 await noOverflow(page,'mission '+width);
});
