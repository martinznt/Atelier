/* Lot 5A — Livre de recettes et Sport dans Atelier : le parcours de Martin sur téléphone (360 et 390 px), joué dans le vrai navigateur contre le Worker local.
   Aucun appel réel à GitHub : ce parcours n'a pas besoin de dépôt relié (import, loupe, source et niveau). */
import {test,expect,type Page} from './fixtures';
const ORIGIN='http://localhost:8787';
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});
for(const width of [360,390])test(`Recettes et Sport : import, loupe, source et niveau à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width,height:800});
 const email=`lot5a_${width}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot5a');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 for(const name of ['Livre de recettes','Sport']){const r=await page.request.post('/api/projects',{data:{name},headers:{Origin:ORIGIN}});expect(r.ok()).toBe(true);}
 await page.reload();
 const sites=[{name:'Livre de recettes',gabarit:'livre_recettes',file:'docs/sites/recettes-depart.json',seedName:'recettes-depart.json',decisions:4},{name:'Sport',gabarit:'sport',file:'docs/sites/sport-depart.json',seedName:'sport-depart.json',decisions:1}];
 for(const s of sites){
  await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
  await page.getByText(s.name,{exact:true}).first().click();
  await page.locator('summary:has(> strong:text-is("Modèle du projet"))').click();
  await page.getByLabel('Gabarit de départ').selectOption(s.gabarit);
  await expect(page.getByText('Suivi des fonctionnalités').first()).toBeVisible();
  await page.locator('summary:has(> strong:text-is("Importer un fichier de départ"))').click();
  await page.locator('input[type="file"]').setInputFiles(s.file);
  await expect(page.getByText(`Aperçu de « ${s.seedName} »`)).toBeVisible();await expect(page.getByText('rien n’est encore écrit')).toBeVisible();
  await noOverflow(page,'aperçu '+s.name);expect(await smallText(page),'texte sous 12 px (aperçu '+s.name+')').toEqual([]);
  await page.screenshot({path:`test-results/lot5a-apercu-${s.gabarit}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:new RegExp(`^Ajouter \\d+ fonctionnalité\\(s\\) et ${s.decisions} décision\\(s\\)$`)}).click();
  await expect(page.getByText(new RegExp(`^Importé : \\d+ fonctionnalité\\(s\\) et ${s.decisions} décision\\(s\\) ajoutée\\(s\\)`))).toBeVisible({timeout:30000});
  await page.locator('input[type="file"]').setInputFiles(s.file);
  await expect(page.getByText('Tout est déjà présent : il n’y a rien à ajouter.')).toBeVisible();
 }
 // (2)(3) la loupe retrouve une fonctionnalité de chaque site, avec sa source et son niveau
 for(const [q,expected] of [['PR n°94',/F-\d+ — PR n°94/],['endroits liés',/F-\d+ — Les mettre à tous les endroits liés/]] as const){
  await page.getByRole('button',{name:'Recherche globale'}).click();await page.getByRole('searchbox',{name:'Recherche globale'}).fill(q);
  await expect(page.getByText(expected).last()).toBeVisible();await noOverflow(page,'recherche '+q);
  await page.screenshot({path:`test-results/lot5a-recherche-${q.slice(0,4)}-${width}.png`,fullPage:true});await page.keyboard.press('Escape');
 }
 // la fonctionnalité de Sport, dans la liste : source (fichier, ligne, commit) et niveau « Rapporté »
 await page.locator('summary:has(> strong:text-is("Suivi des fonctionnalités"))').click();
 const row=page.locator('details.fold:has(> summary:has-text("Les mettre à tous les endroits liés"))').first();await row.locator('> summary').click();
 await expect(row.getByText(/Source : Fichier du dépôt — martinznt\/Sport : docs\/DEMANDES_8_35\.md, ligne 38/)).toBeVisible();
 await expect(row.getByText(/Étiquette d’origine : 🟡/)).toBeVisible();
 await noOverflow(page,'fonctionnalité Sport');expect(await smallText(page),'texte sous 12 px (fonctionnalité)').toEqual([]);
 await page.screenshot({path:`test-results/lot5a-fonctionnalite-sport-${width}.png`,fullPage:true});
});
