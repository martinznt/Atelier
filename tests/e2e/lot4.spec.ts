/* Lot 4 — « Atelier dans Atelier » : le parcours de Martin sur téléphone (360 et 390 px), joué dans le vrai navigateur contre le Worker local.
   Aucun appel réel à GitHub : le dépôt de la mission est inséré dans la base locale (comme au lot 3). */
import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const ORIGIN='http://localhost:8787';
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});
const sql=(q:string)=>execFileSync('npx',['wrangler','d1','execute','atelier-db','--local','--command',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
for(const width of [360,390])test(`Atelier dans Atelier : import, recherche, tâche, mission, verdict à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width,height:800});
 const email=`lot4_${width}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot4');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const created=await page.request.post('/api/projects',{data:{name:'Atelier'},headers:{Origin:ORIGIN}});expect(created.ok()).toBe(true);const project=(await created.json()).id as string;
 const me=(await (await page.request.get('/api/auth/me')).json()).user.id as string;
 await page.reload();
 // (2) ouvrir le projet dans Pilotage
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
 await page.screenshot({path:`test-results/lot4-pilotage-${width}.png`,fullPage:true});
 await page.getByText('Atelier',{exact:true}).first().click();
 // gabarit « Atelier lui-même » (active le suivi des fonctionnalités)
 await page.locator('summary:has(> strong:text-is("Modèle du projet"))').click();
 await page.getByLabel('Gabarit de départ').selectOption('atelier');
 await expect(page.getByText('Suivi des fonctionnalités').first()).toBeVisible();
 // (1) importer le fichier de départ : aperçu, puis ajout
 await page.locator('summary:has(> strong:text-is("Importer un fichier de départ"))').click();
 await page.locator('input[type="file"]').setInputFiles('docs/atelier-dans-atelier/atelier-depart.json');
 await expect(page.getByText('Aperçu de « atelier-depart.json »')).toBeVisible();
 await expect(page.getByText('rien n’est encore écrit')).toBeVisible();
 await noOverflow(page,'aperçu import');expect(await smallText(page),'texte sous 12 px (import)').toEqual([]);
 await page.screenshot({path:`test-results/lot4-import-apercu-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:/^Ajouter \d+ fonctionnalité\(s\) et 12 décision\(s\)$/}).click();
 await expect(page.getByText(/^Importé : \d+ fonctionnalité\(s\) et 12 décision\(s\) ajoutée\(s\)/)).toBeVisible({timeout:30000});
 // une seconde fois : rien n'est ajouté
 await page.locator('input[type="file"]').setInputFiles('docs/atelier-dans-atelier/atelier-depart.json');
 await expect(page.getByText('Tout est déjà présent : il n’y a rien à ajouter.')).toBeVisible();
 await page.screenshot({path:`test-results/lot4-import-deuxieme-${width}.png`,fullPage:true});
 // (3) la loupe retrouve une fonctionnalité, sa source et son niveau
 await page.getByRole('button',{name:'Recherche globale'}).click();await page.getByRole('searchbox',{name:'Recherche globale'}).fill('Migration 0023');
 await expect(page.getByText(/F-\d+ — Migration 0023 : projets existants identiques/).last()).toBeVisible();await expect(page.getByText('Source : Atelier').first()).toBeVisible();
 await noOverflow(page,'recherche');await page.screenshot({path:`test-results/lot4-recherche-${width}.png`,fullPage:true});
 await page.keyboard.press('Escape');
 // la fonctionnalité dans la liste : source et niveau lisibles
 await page.locator('summary:has(> strong:text-is("Suivi des fonctionnalités"))').click();
 const row=page.locator('details.fold:has(> summary:has-text("Migration 0023 : projets existants identiques"))').first();await row.locator('> summary').click();
 await expect(row.getByText(/Source : Fichier du dépôt — docs\/audits\/RAPPORT_LOT_1/)).toBeVisible();
 await expect(row.locator('> summary .rel-verified')).toBeVisible();
 await noOverflow(page,'fonctionnalité');expect(await smallText(page),'texte sous 12 px (fonctionnalités)').toEqual([]);
 await page.screenshot({path:`test-results/lot4-fonctionnalite-${width}.png`,fullPage:true});
 // décisions : proposées, validées par Martin (ici l'une d'elles)
 const decs=await (await page.request.get(`/api/spaces/${project}/decisions`)).json();
 expect(decs.items.length).toBe(12);expect(new Set(decs.items.map((d:any)=>d.status))).toEqual(new Set(['proposed']));
 // dépôt et tâche : insérés dans la base locale (aucun appel réel à GitHub)
 const at=new Date().toISOString(),conn=crypto.randomUUID(),repo=crypto.randomUUID(),task=crypto.randomUUID();
 sql(`INSERT INTO connections(id,user_id,provider,label,secret,created_at) VALUES('${conn}','${me}','github','gh essai','x','${at}');`
  +`INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch) VALUES('${repo}','${me}','${project}','${conn}','martinznt/Atelier','main','${'0'.repeat(40)}','${at}','main');`
  +`INSERT INTO plan_tasks(id,user_id,project_id,title,objective,acceptance,created_at,updated_at) VALUES('${task}','${me}','${project}','Lot 5A — Relier Sport et Livre de recettes','Relier les deux dépôts en lecture seule.','Les deux sites sont suivis dans Atelier.','${at}','${at}');`);
 await page.reload();await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();await page.getByText('Atelier',{exact:true}).first().click();
 // Valider une décision à l'écran : « Proposée » → « Actuelle », avec « Je valide »
 const decSec=page.locator('details.fold:has(> summary > strong:text-is("Décisions et À trancher"))').first();
 if(await decSec.getAttribute('open')===null)await decSec.locator('> summary').click(); // elle s'ouvre seule tant qu'il y a des décisions à trancher
 const dec=page.locator('details.fold:has(> summary:has-text("D2 — tout gratuit"))').first();await dec.locator('> summary').click();
 await dec.getByLabel('Nouvel état').selectOption('current');await dec.getByLabel('Pourquoi ce changement ? (gardé dans l’historique)').fill('Je confirme ce choix.');
 await dec.getByLabel(/Je valide/).check();await dec.getByRole('button',{name:'Enregistrer le changement'}).click();
 await expect(dec.locator('> summary').getByText('Actuelle')).toBeVisible();
 await noOverflow(page,'décision validée');await page.screenshot({path:`test-results/lot4-decision-${width}.png`,fullPage:true});
 // (4) générer la mission
 await page.locator('summary:has(> strong:text-is("Missions pour Claude Code"))').click();
 const sec=page.locator('details.fold',{has:page.locator(':scope > summary > strong:text-is("Missions pour Claude Code")')}).first();
 await expect(sec.getByText('Une mission est un texte court et complet')).toBeVisible();
 await sec.locator('summary',{hasText:'Nouvelle mission'}).click();
 await sec.getByLabel('Tâche du plan').selectOption({label:'Lot 5A — Relier Sport et Livre de recettes'});
 await sec.getByLabel(/Complet : ajoute le contexte/).check();
 await sec.getByLabel(/F-\d+ — Lot 5A — Relier Sport et Livre de recettes \(lecture seule\)/).check();
 await sec.getByLabel(/D2 — tout gratuit/).check();
 await noOverflow(page,'nouvelle mission');await page.screenshot({path:`test-results/lot4-nouvelle-mission-${width}.png`,fullPage:true});
 await sec.getByRole('button',{name:'Créer le brouillon'}).click();
 await sec.locator('summary',{hasText:'Lot 5A — Relier Sport et Livre de recettes'}).first().click();
 await expect(page.getByText('Règles pas encore lues')).toBeVisible();
 await expect(sec.locator('pre.handoff-preview').first()).toContainText('Décision actuelle');
 await expect(sec.locator('pre.handoff-preview').first()).toContainText('D2 — tout gratuit');
 await noOverflow(page,'mission brouillon');expect(await smallText(page),'texte sous 12 px (mission)').toEqual([]);
 await page.screenshot({path:`test-results/lot4-mission-brouillon-${width}.png`,fullPage:true});
 // sans périmètre ni fichiers, Atelier refuse de figer (sinon Claude Code poserait des questions)
 await page.getByLabel('Préparer quand même sans les règles du dépôt').check();
 await page.getByRole('button',{name:'Préparer la mission (figer le texte)'}).click();await expect(page.getByRole('alert')).toContainText('Il manque le périmètre ou les fichiers concernés');
 await page.getByLabel('Périmètre (ce qu’il faut faire)').fill('Lecture seule des dépôts Sport et Livre de recettes.');await page.getByLabel('Fichiers concernés').fill('server/lifecycle-core.ts');
 await page.getByRole('button',{name:'Enregistrer le brouillon'}).click();await expect(page.getByText('Brouillon enregistré.')).toBeVisible();
 // GitHub n'est pas joignable ici : la mission part « sans les règles » seulement sur confirmation explicite
 await page.getByRole('button',{name:'Préparer la mission (figer le texte)'}).click();
 await expect(page.getByRole('button',{name:'Copier le texte exact'})).toBeVisible();
 await expect(sec.locator('pre.handoff-preview').first()).toContainText('RÈGLES DU DÉPÔT NON LUES');
 await noOverflow(page,'mission figée');expect(await smallText(page),'texte sous 12 px (mission figée)').toEqual([]);
 await page.screenshot({path:`test-results/lot4-mission-figee-${width}.png`,fullPage:true});
 // verdict en un clic
 await page.getByRole('button',{name:'À refaire',exact:true}).click();await expect(page.getByText('Verdict actuel : À refaire')).toBeVisible();
});
