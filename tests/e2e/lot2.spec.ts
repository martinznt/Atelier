/* Lot 2 (étape A) — interface lisible : ligne d'aide sur chaque écran (G1), page « Bien utiliser Atelier » (G2),
   libellés corrigés, journal unique dans « Activité », raccourcis, aucun texte sous 12 px, aucun débordement.
   Étape B : 4 entrées par intention, barre du bas sans élément caché. Rejoue aussi les parcours versionnables parmi les 38 (1, 2, 3, 29, 31, 32, 34, 38) : voir docs/audits/RAPPORT_LOT_2_*.md. */
import {test,expect,type Page} from './fixtures';
const ORIGIN='http://localhost:8787';
const MODULES=['Accueil','À traiter','Mes projets','Pilotage','Discussions','Fichiers','Activité','Mémoire','Réglages','Quotas Claude Code'];
const ENTRY:Record<string,string>={Accueil:'Aujourd’hui','À traiter':'Aujourd’hui','Mes projets':'Projets',Pilotage:'Projets',Discussions:'Projets',Fichiers:'Projets',Activité:'Projets',Mémoire:'Savoir',Réglages:'Réglages et aide','Quotas Claude Code':'Réglages et aide',Aide:'Réglages et aide'};
/* Étape B : on ouvre l'entrée de la barre, puis l'onglet de l'écran s'il y en a plusieurs. */
async function open(page:Page,label:string){
 const entry=ENTRY[label]||label;
 await page.locator('.sidebar nav button',{hasText:entry}).first().click();
 const tabs=page.locator('.screen-tabs');
 if(await tabs.count()&&label!==entry)await tabs.getByRole('button',{name:label,exact:true}).click();
 await page.waitForTimeout(400);
}
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim(),el=n.parentElement;if(!t||!el)continue;const cs=getComputedStyle(el),r=el.getBoundingClientRect();if(cs.display==='none'||cs.visibility==='hidden'||!r.width||!r.height)continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,25)+' '+px);}return bad;});
for(const width of [360,390,1280])test(`interface lisible et guide à ${width} px`,async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:800});
 const email=`lot2_${width}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot2');await page.locator('form button[type="submit"]').first().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 await page.request.post('/api/spaces/init',{data:{template:'sport'},headers:{Origin:ORIGIN}});await page.reload();await expect(page.getByRole('heading',{name:'Où en sont vos projets'})).toBeVisible({timeout:20000}); // parcours 1
 for(const m of MODULES){ // parcours 3, 31, 32 : tous les modules atteignables, sans débordement ; G1 présent ; texte ≥ 12 px
  await open(page,m);
  await expect(page.locator('[data-guide]'),'ligne d’aide : '+m).toContainText('À quoi ça sert');
  await expect(page.locator('[data-guide]')).toContainText('La suite logique');
  await noOverflow(page,m);expect(await smallText(page),'texte sous 12 px : '+m).toEqual([]);
 }
 // libellés corrigés
 await open(page,'Quotas Claude Code');await expect(page.getByText('QUOTAS ET RETOURS CLAUDE CODE',{exact:false}).first()).toBeVisible();
 await open(page,'À traiter');await expect(page.getByRole('tab',{name:'À faire par vous'})).toBeVisible();await expect(page.getByText('À faire par Martin')).toHaveCount(0);
 // G2 : le lien d'aide ouvre la page avec 5 parcours
 await page.locator('[data-guide] .guide-link').click();
 await expect(page.getByRole('heading',{name:'Bien utiliser Atelier'})).toBeVisible();await expect(page.locator('.help-path')).toHaveCount(5);await noOverflow(page,'aide');
 // journal unique : le raccourci de Pilotage mène à Activité, filtré sur le projet
 await open(page,'Pilotage');await page.locator('summary',{hasText:'Journal du projet'}).first().scrollIntoViewIfNeeded();
 await page.getByRole('button',{name:'Ouvrir le journal de ce projet'}).click();
 await expect(page.getByRole('heading',{name:'Activité',exact:true})).toBeVisible();
 await expect(page.getByLabel('Journal du projet')).not.toHaveValue('');
 // raccourci relais : Pilotage → Transmissions → Prompts
 await open(page,'Pilotage');await page.locator('summary',{hasText:'Transmissions aux IA'}).click();
 await page.getByRole('button',{name:'Ouvrir « Prompts »'}).click();
 await expect(page.getByRole('heading',{name:'Mémoire et consignes'})).toBeVisible();await expect(page.getByRole('tab',{name:'Prompts'}).or(page.getByRole('button',{name:'Prompts'})).first()).toBeVisible();
 // parcours 34 : la loupe s'ouvre et se ferme
 await page.getByRole('button',{name:'Recherche globale'}).click();await expect(page.getByRole('searchbox',{name:'Recherche globale'})).toBeVisible();await noOverflow(page,'loupe');await page.keyboard.press('Escape');
 // parcours 29 : le rechargement garde la session
 await page.reload();await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 // parcours 38 : bandeau hors connexion
 await page.context().setOffline(true);await expect(page.locator('.offline-banner')).toBeVisible();await expect(page.locator('main')).toBeVisible();await page.context().setOffline(false);
});

for(const width of [360,390,1280])test(`4 entrées et barre du bas sans élément caché à ${width} px`,async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:800});
 const email=`lot2b_${width}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot2');await page.locator('form button[type="submit"]').first().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 await page.reload();await expect(page.getByRole('heading',{name:'Où en sont vos projets'})).toBeVisible({timeout:20000}); // le rechargement ferme la fenêtre des codes de récupération
 const bar=page.locator('.sidebar nav button');
 await expect(page.locator('.nav-more')).toHaveCount(0);
 for(const name of ['Aujourd’hui','Projets','Savoir','Réglages et aide'])await expect(page.locator('.sidebar nav button',{hasText:name}),'entrée : '+name).toBeVisible();
 if(width<=640){
  await expect(page.locator('.sidebar nav button',{hasText:'Recherche'})).toBeVisible();
  await expect(bar,'barre du bas : 4 entrées + recherche').toHaveCount(5);
  for(let i=0;i<5;i++){const b=await bar.nth(i).boundingBox();expect(b,'bouton '+i+' visible').not.toBeNull();expect(b!.x>=0&&b!.x+b!.width<=width+0.5,'bouton '+i+' dans l’écran').toBe(true);expect(b!.width>=44&&b!.height>=44,'bouton '+i+' assez grand pour le doigt').toBe(true);}
  await bar.nth(4).click({timeout:8000});await expect(page.getByRole('searchbox',{name:'Recherche globale'})).toBeVisible();await page.keyboard.press('Escape');
 }
 // chaque écran est atteignable par son entrée, et les onglets d'une entrée sont tous visibles
 for(const [entry,tabs] of [['Aujourd’hui',['Accueil','À traiter']],['Projets',['Mes projets','Pilotage','Discussions','Fichiers','Activité']],['Réglages et aide',['Réglages','Quotas Claude Code','Aide']]] as [string,string[]][]){
  await page.locator('.sidebar nav button',{hasText:entry}).first().click();
  for(const t of tabs)await expect(page.locator('.screen-tabs').getByRole('button',{name:t,exact:true}),entry+' → '+t).toBeVisible();
  await noOverflow(page,entry);
 }
 await page.locator('.sidebar nav button',{hasText:'Savoir'}).click();await expect(page.getByRole('heading',{name:'Mémoire et consignes'})).toBeVisible();
 // l'entrée garde le dernier écran ouvert
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Activité',exact:true}).click();
 await page.locator('.sidebar nav button',{hasText:'Savoir'}).click();await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();
 await expect(page.getByRole('heading',{name:'Activité',exact:true})).toBeVisible();
});

/* Parcours 11 à 14 rejoués avec la nouvelle navigation : tâche du plan → consigne pour Claude Code → « Savoir » → « Prompts » (« Copié » n'est pas « Transmis »). */
for(const width of [360,1280])test(`tâche, consigne pour Claude Code et prompts à ${width} px`,async({page})=>{
 test.setTimeout(45000);
 await page.setViewportSize({width,height:800});
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(`lot2c_${width}_${Date.now().toString(36)}@example.test`);await page.locator('input[type="password"]').fill('test1234-lot2');await page.locator('form button[type="submit"]').first().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 await page.request.post('/api/spaces/init',{data:{template:'sport'},headers:{Origin:ORIGIN}});await page.reload();
 await open(page,'Pilotage');
 await page.locator('summary:has(> strong:text-is("Plan"))').click();
 const plan=page.locator('details',{has:page.locator('summary:has(> strong:text-is("Plan"))')});
 await plan.getByLabel('Titre',{exact:true}).fill('Corriger le tri des séances');
 await plan.getByLabel('Critère d’acceptation').fill('Le tri est stable');
 await plan.getByRole('button',{name:'Ajouter la tâche'}).click(); // parcours 11
 await page.locator('summary',{hasText:'Corriger le tri des séances'}).first().click();
 await page.locator('summary',{hasText:'Consigne de développement et validation'}).click();
 await page.getByRole('button',{name:'Préparer une consigne pour Claude Code'}).click(); // parcours 12
 await expect(page.getByText('Consigne préparée dans Mémoire',{exact:false})).toBeVisible();
 await open(page,'Mémoire');await page.getByRole('tab',{name:'Prompts',exact:true}).click();
 await expect(page.getByText('Corriger le tri des séances').first()).toBeVisible();
 await noOverflow(page,'prompts');
});
