/* Lot 5B (5B-2) — modifier une maquette sur téléphone (360 et 390 px) : glisser (souris ET doigt), boutons, groupes, couleurs, annuler/rétablir.
   Les gestes sont de vrais événements du navigateur (souris, et toucher envoyé par le protocole de Chromium). La capture est une vraie capture d'écran. */
import {test,expect,type Page} from './fixtures';
import {mkdirSync} from 'node:fs';
const ORIGIN='http://localhost:8787';
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});

async function prepare(page:Page,width:number,tag:string){
 await page.setViewportSize({width,height:780});
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(`lot5b_${tag}_${width}_${Date.now().toString(36)}@example.test`);await page.locator('input[type="password"]').fill('test1234-lot5b');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const proj=await page.request.post('/api/projects',{data:{name:'Livre de recettes (essai)'},headers:{Origin:ORIGIN}});const projectId=(await proj.json()).id;
 await page.reload();mkdirSync('test-results',{recursive:true});const shot=`test-results/lot5b-edit-capture-${tag}-${width}.png`;await page.screenshot({path:shot});
 const mk=await page.request.post('/api/mockups',{data:{project_id:projectId,title:'Accueil',page_name:'Accueil'},headers:{Origin:ORIGIN}});const id=(await mk.json()).id;
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
 await page.getByText('Livre de recettes (essai)',{exact:true}).first().click();
 await page.locator('summary:has(> strong:text-is("Maquettes d’écran"))').click();await page.locator('details.fold:has(> summary:has-text("Accueil"))').first().locator('> summary').click();
 await page.locator('input[type="file"][accept="image/*"]').setInputFiles(shot);await expect(page.getByText(/^Capture enregistrée : /)).toBeVisible({timeout:30000});
 return {id,projectId};
}
const addBlock=async(page:Page,kind:string,label:string)=>{
 await page.locator('.mq-add label.field:has(> span:text-is("Type")) select').selectOption(kind);await page.locator('.mq-add').getByLabel('Nom du bloc').fill(label);
 await page.locator('.mq-add').getByRole('button',{name:'Ajouter ce bloc'}).click();await expect(page.locator('.mq-panel strong').first()).toHaveText(label);
};
const setDetails=async(page:Page,x:string,y:string,w:string,h:string)=>{
 const d=page.locator('.mq-panel');await d.getByLabel('Depuis la gauche').fill(x);await d.getByLabel('Depuis le haut').fill(y);await d.getByLabel('Largeur',{exact:true}).fill(w);await d.getByLabel('Hauteur',{exact:true}).fill(h);
 await d.getByRole('button',{name:'Appliquer les détails'}).click();await expect(d.locator('.mq-pad-c')).toHaveText(`${x} · ${y}`);
};
/** Capture de preuve (taille CSS, sans agrandissement) d'une zone de l'écran, au moment exact du geste. */
const proof=async(loc:any,name:string)=>{mkdirSync('test-results/preuves',{recursive:true});await loc.screenshot({path:`test-results/preuves/${name}.png`,scale:'css',animations:'disabled'});};
const blocksOf=async(page:Page,id:string)=>(await (await page.request.get(`/api/mockups/${id}`)).json()).blocks as any[];
const byLabel=(bl:any[],l:string)=>bl.find(b=>b.label===l);

for(const width of [360,390])test(`Modifier : boutons, groupes, couleurs, annuler/rétablir à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 const {id}=await prepare(page,width,'btn');
 await addBlock(page,'button','Bouton A');await setDetails(page,'16','100','120','48');
 await addBlock(page,'card','Carte B');await setDetails(page,'16','200','200','100');
 await addBlock(page,'text','Texte C');await setDetails(page,'200','320','120','40');
 const panel=page.locator('.mq-panel');

 // déplacer par les boutons (pas de 8 px), puis annuler et rétablir
 await page.locator('.mq-item',{hasText:'Bouton A'}).click();
 if(width===360)await proof(page.locator('.mq-stage'),'5b2-01-trois-blocs-avant');
 await panel.getByRole('button',{name:'À droite'}).click();await expect(panel.locator('.mq-pad-c')).toHaveText('24 · 100');
 await panel.getByRole('button',{name:'Descendre'}).click();await expect(panel.locator('.mq-pad-c')).toHaveText('24 · 108');
 expect(byLabel(await blocksOf(page,id),'Bouton A')).toMatchObject({x:24,y:108});
 if(width===360){await proof(page.locator('.mq-bar'),'5b2-02a-annuler-disponible');await proof(panel.locator('.mq-pad'),'5b2-02b-boutons-position-24-108');}
 await page.getByRole('button',{name:/^Annuler : Déplacer le bloc/}).click();await expect(panel.locator('.mq-pad-c')).toHaveText('24 · 100');
 await page.getByRole('button',{name:/^Rétablir : Déplacer le bloc/}).click();await expect(panel.locator('.mq-pad-c')).toHaveText('24 · 108');
 // le pas : 32 px
 await panel.getByLabel('Pas du déplacement').selectOption('32');await panel.getByRole('button',{name:'À droite'}).click();await expect(panel.locator('.mq-pad-c')).toHaveText('56 · 108');
 // au bord de l'écran : le bloc s'arrête au bord, sans erreur de serveur
 await panel.getByRole('button',{name:'À gauche'}).click();await panel.getByRole('button',{name:'À gauche'}).click();await expect(panel.locator('.mq-pad-c')).toHaveText('0 · 108');
 await panel.getByRole('button',{name:'À gauche'}).click();await expect(page.getByRole('alert')).toContainText('déjà au bord');

 // placer sous un autre bloc
 await panel.getByLabel('Placer ce bloc juste sous…').selectOption({label:'Carte B'});await expect(panel.locator('.mq-pad-c')).toHaveText('16 · 308');
 expect(byLabel(await blocksOf(page,id),'Bouton A')).toMatchObject({x:16,y:308});

 // taille
 await panel.getByLabel('Pas du déplacement').selectOption('8');await panel.getByRole('button',{name:'Plus large'}).click();
 expect(byLabel(await blocksOf(page,id),'Bouton A')).toMatchObject({w:128,h:48});

 // grouper deux blocs, déplacer le groupe entier, séparer
 await page.getByLabel('Choisir plusieurs blocs à la fois').check();await page.locator('.mq-item',{hasText:'Carte B'}).click();
 await expect(panel.locator('strong').first()).toHaveText('2 blocs choisis');
 await panel.getByLabel('Nom du groupe').fill('Haut');await panel.getByRole('button',{name:'Grouper le choix'}).click();
 await expect(panel.getByText('Groupe(s) du choix : Haut')).toBeVisible();
 if(width===360){await proof(page.locator('.mq-legend'),'5b2-03-groupe-haut-liste');}
 let bl=await blocksOf(page,id);expect(byLabel(bl,'Bouton A').group_name).toBe('Haut');expect(byLabel(bl,'Carte B').group_name).toBe('Haut');expect(byLabel(bl,'Texte C').group_name).toBe('');
 await page.getByLabel('Choisir plusieurs blocs à la fois').uncheck();await page.locator('.mq-item',{hasText:'Carte B'}).click();
 await panel.getByLabel('Déplacer aussi tout le groupe du bloc').check();await panel.getByRole('button',{name:'À droite'}).click();
 bl=await blocksOf(page,id);expect(byLabel(bl,'Carte B').x).toBe(24);expect(byLabel(bl,'Bouton A').x).toBe(24);expect(byLabel(bl,'Texte C').x).toBe(200);
 await panel.getByRole('button',{name:'Séparer du groupe'}).click();
 bl=await blocksOf(page,id);expect(byLabel(bl,'Carte B').group_name).toBe('');expect(byLabel(bl,'Bouton A').group_name).toBe('Haut');
 await page.getByRole('button',{name:/^Annuler : Séparer/}).click();await expect(panel.getByText('Groupe(s) du choix : Haut')).toBeVisible();

 // couleurs de la palette du site (lues dans le dépôt)
 await panel.getByLabel('Palette du site').selectOption('recettes');await expect(panel.getByText(/public\/css\/app\.css du dépôt, commit 92ec7c5/)).toBeVisible();
 await panel.getByRole('button',{name:'Fond #d39a62 (--accent)'}).click();
 expect(byLabel(await blocksOf(page,id),'Carte B').fill).toBe('#d39a62');
 if(width===360){await proof(page.locator('.mq-stage'),'5b2-04a-carte-coloree');await proof(panel.locator('.mq-swatches').first(),'5b2-04b-palette-recettes');}
 await panel.getByRole('button',{name:'Texte #14110e (--bg)'}).click();expect(byLabel(await blocksOf(page,id),'Carte B').text_color).toBe('#14110e');
 await page.getByRole('button',{name:/^Annuler : Changer la couleur/}).click();expect(byLabel(await blocksOf(page,id),'Carte B').text_color).toBe('');
 await panel.getByRole('button',{name:'Fond : aucune'}).click();expect(byLabel(await blocksOf(page,id),'Carte B').fill).toBe('');
 await panel.getByLabel('Fond : autre couleur #rrggbb').fill('#123456');await panel.getByRole('button',{name:'Autre couleur'}).first().click();
 await expect(panel.getByText('Choisie : #123456 (hors palette du site)').first()).toBeVisible();

 // supprimer puis annuler : le bloc revient tel quel
 await page.locator('.mq-item',{hasText:'Texte C'}).click();await panel.getByRole('button',{name:'Supprimer ce bloc'}).click();
 await expect(page.locator('.mq-block')).toHaveCount(2);if(width===360)await proof(page.locator('.mq-stage'),'5b2-05a-bloc-supprime');
 await page.getByRole('button',{name:/^Annuler : Supprimer le bloc/}).click();await expect(page.locator('.mq-block')).toHaveCount(3);if(width===360)await proof(page.locator('.mq-stage'),'5b2-05b-suppression-annulee');
 expect(byLabel(await blocksOf(page,id),'Texte C')).toMatchObject({x:200,y:320,w:120,h:40});

 // tout est enregistré : après rechargement, l'état est le même
 const saved=JSON.stringify((await blocksOf(page,id)).map(b=>[b.label,b.x,b.y,b.w,b.h,b.group_name,b.fill,b.text_color]));
 await page.reload();expect(JSON.stringify((await blocksOf(page,id)).map(b=>[b.label,b.x,b.y,b.w,b.h,b.group_name,b.fill,b.text_color]))).toBe(saved);

 // ergonomie : cibles tactiles ≥ 44 px, pas de débordement, pas de texte sous 12 px
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
 await page.getByText('Livre de recettes (essai)',{exact:true}).first().click();
 await page.locator('summary:has(> strong:text-is("Maquettes d’écran"))').click();await page.locator('details.fold:has(> summary:has-text("Accueil"))').first().locator('> summary').click();
 await page.locator('.mq-item',{hasText:'Carte B'}).click();
 for(const loc of [panel.getByRole('button',{name:'À droite'}),panel.getByRole('button',{name:'Plus large'}),panel.getByRole('button',{name:'Grouper le choix'}),page.getByRole('button',{name:/^Annuler/}),panel.getByRole('button',{name:'Fond : aucune'})]){
  const bx=await loc.boundingBox();expect(bx!.height,'hauteur de bouton').toBeGreaterThanOrEqual(43.5);expect(bx!.width,'largeur de bouton').toBeGreaterThanOrEqual(43.5);
 }
 for(const sw of await panel.locator('.mq-sw').all()){const bx=await sw.boundingBox();expect(bx!.width).toBeGreaterThanOrEqual(43.5);expect(bx!.height).toBeGreaterThanOrEqual(43.5);}
 await noOverflow(page,'éditeur '+width);expect(await smallText(page),'texte sous 12 px').toEqual([]);
 await page.screenshot({path:`test-results/lot5b-edition-${width}.png`,fullPage:true});
});

for(const width of [360,390])test(`Modifier : glisser à la souris puis au doigt à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 const {id}=await prepare(page,width,'drag');
 await addBlock(page,'card','Carte');await setDetails(page,'40','200','160','100');
 await addBlock(page,'button','Bouton');await setDetails(page,'40','400','120','48');
 const panel=page.locator('.mq-panel');
 await page.locator('.mq-item',{hasText:'Carte'}).click();
 const stage=await page.locator('.mq-stage').boundingBox(),k=stage!.width/360;
 const card=page.locator('.mq-block').first();
 // (1) un bloc NON choisi ne se glisse pas : le toucher le choisit seulement (la page peut défiler)
 await page.locator('.mq-item',{hasText:'Bouton'}).click();await page.locator('.mq-item',{hasText:'Bouton'}).click(); // le choisit puis le décoche
 await expect(panel).toHaveCount(0);
 const cb0=await card.boundingBox();await page.mouse.move(cb0!.x+cb0!.width/2,cb0!.y+cb0!.height/2);await page.mouse.down();await page.mouse.move(cb0!.x+cb0!.width/2+40,cb0!.y+cb0!.height/2+40,{steps:4});await page.mouse.up();
 expect(byLabel(await blocksOf(page,id),'Carte')).toMatchObject({x:40,y:200}); // non choisi : rien n'a bougé
 if(!await panel.count())await card.click(); // un simple toucher le choisit
 await expect(panel.locator('strong').first()).toHaveText('Carte');
 // (2) à la souris : le bloc choisi suit le pointeur, puis reste là
 const cb=await card.boundingBox();const sx=cb!.x+cb!.width/2,sy=cb!.y+cb!.height/2;
 await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx+30*k,sy+20*k,{steps:6});
 await expect(card).toHaveClass(/drag/); // aperçu pendant le glisser
 if(width===360)await proof(page.locator('.mq-stage'),'5b2-06a-glisser-souris-pendant');
 await page.mouse.up();
 await expect(panel.locator('.mq-pad-c')).not.toHaveText('40 · 200');
 let c=byLabel(await blocksOf(page,id),'Carte');expect(Math.abs(c.x-70)).toBeLessThanOrEqual(2);expect(Math.abs(c.y-220)).toBeLessThanOrEqual(2);
 const mouseX=c.x,mouseY=c.y;if(width===360)await proof(page.locator('.mq-stage'),'5b2-06b-glisser-souris-apres');
 // annuler remet le bloc où il était
 await page.getByRole('button',{name:/^Annuler : Déplacer le bloc/}).click();c=byLabel(await blocksOf(page,id),'Carte');expect([c.x,c.y]).toEqual([40,200]);
 await page.getByRole('button',{name:/^Rétablir/}).click();c=byLabel(await blocksOf(page,id),'Carte');expect([c.x,c.y]).toEqual([mouseX,mouseY]);
 // (3) un glisser trop loin s'arrête au bord de l'écran (jamais d'erreur)
 const cb2=await card.boundingBox();await page.mouse.move(cb2!.x+cb2!.width/2,cb2!.y+cb2!.height/2);await page.mouse.down();await page.mouse.move(cb2!.x+cb2!.width/2+500,cb2!.y+cb2!.height/2,{steps:5});await page.mouse.up();
 c=byLabel(await blocksOf(page,id),'Carte');expect(c.x+c.w).toBe(360);await expect(page.getByRole('alert')).toHaveCount(0);
 // (4) AU DOIGT : vrais événements tactiles envoyés par Chromium (touchStart, touchMove, touchEnd)
 const cdp=await page.context().newCDPSession(page);
 const before=byLabel(await blocksOf(page,id),'Carte');
 const cb3=await card.boundingBox();const tx=cb3!.x+cb3!.width/2,ty=cb3!.y+cb3!.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-8*k*i/2,y:ty+6*k*i}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(async()=>byLabel(await blocksOf(page,id),'Carte').y,{timeout:10000}).toBeGreaterThan(before.y+15);
 if(width===360)await proof(page.locator('.mq-stage'),'5b2-07-glisser-doigt-apres');
 const after=byLabel(await blocksOf(page,id),'Carte');expect(after.x).toBeLessThan(before.x);expect(Math.abs(after.y-(before.y+36))).toBeLessThanOrEqual(3);expect(Math.abs(after.x-(before.x-24))).toBeLessThanOrEqual(3);
 await noOverflow(page,'glisser '+width);
 await page.screenshot({path:`test-results/lot5b-glisser-${width}.png`,fullPage:false});
});

test('Modifier : deux écrans ouverts en même temps — le second est prévenu, rien ne se perd',async({page,browser})=>{
 test.setTimeout(240000);
 const {id}=await prepare(page,360,'conf');
 await addBlock(page,'button','Bouton');await setDetails(page,'16','100','120','48');
 const panel=page.locator('.mq-panel');
 // un autre écran (même compte) modifie la maquette par l'API pendant que celui-ci est ouvert
 const cur=await (await page.request.get(`/api/mockups/${id}`)).json();
 const r=await page.request.post(`/api/mockups/${id}/ops`,{data:{revision:cur.revision,ops:[{op:'update',id:cur.blocks[0].id,patch:{y:300}}]},headers:{Origin:ORIGIN}});expect(r.ok()).toBe(true);
 await panel.getByRole('button',{name:'Descendre'}).click();
 await expect(page.getByRole('alert')).toContainText('a changé');await expect(page.getByRole('alert')).toContainText('Rechargez');
 await proof(page.getByRole('alert'),'5b2-08-conflit-deux-ecrans');
 // rien n'a été perdu ni écrasé : la valeur de l'autre écran est là
 expect(byLabel(await blocksOf(page,id),'Bouton').y).toBe(300);
 // la maquette s'est rechargée : on peut continuer
 await expect(panel.locator('.mq-pad-c')).toHaveText('16 · 300'); // le bloc reste choisi, à sa nouvelle place
 await panel.getByRole('button',{name:'Descendre'}).click();await expect(panel.locator('.mq-pad-c')).toHaveText('16 · 308');
});
