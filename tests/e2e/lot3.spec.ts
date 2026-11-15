/* Lot 3 — missions pour Claude Code : écran à 360 et 390 px, sans débordement, texte ≥ 12 px.
   Les lignes d'essai (dépôt, tâche, mission) sont insérées directement dans la base locale : aucun appel réel à GitHub n'est fait ici. */
import {test,expect,type Page} from './fixtures';
import {execFileSync} from 'node:child_process';
const ORIGIN='http://localhost:8787';
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});
const sql=(q:string)=>execFileSync('npx',['wrangler','d1','execute','atelier-db','--local','--command',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
for(const width of [360,390])test(`missions pour Claude Code à ${width} px`,async({page})=>{
 test.setTimeout(180000);
 await page.setViewportSize({width,height:800});
 const email=`lot3_${width}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234-lot3');await page.locator('form button[type="submit"]').first().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const init=await page.request.post('/api/spaces/init',{data:{template:'livre_recettes'},headers:{Origin:ORIGIN}});expect(init.ok()).toBe(true);const project=(await init.json()).project_id as string;
 const me=(await (await page.request.get('/api/auth/me')).json()).user.id as string;
 const at=new Date().toISOString(),conn=crypto.randomUUID(),repo=crypto.randomUUID(),task=crypto.randomUUID(),mission=crypto.randomUUID();
 sql(`INSERT INTO connections(id,user_id,provider,label,secret,created_at) VALUES('${conn}','${me}','github','gh essai','x','${at}');`
  +`INSERT INTO repositories(id,user_id,project_id,connection_id,full_name,branch,head_sha,created_at,default_branch) VALUES('${repo}','${me}','${project}','${conn}','martinznt/Livre-de-recettes','main','${'0'.repeat(40)}','${at}','main');`
  +`INSERT INTO plan_tasks(id,user_id,project_id,title,objective,acceptance,created_at,updated_at) VALUES('${task}','${me}','${project}','Ajouter la liste de courses','Pouvoir cocher des ingrédients.','La liste se garde hors connexion.','${at}','${at}');`
  +`INSERT INTO missions(id,user_id,project_id,task_id,repository_id,repo_full_name,branch,title,fields,created_at,updated_at) VALUES('${mission}','${me}','${project}','${task}','${repo}','martinznt/Livre-de-recettes','main','Ajouter la liste de courses','{"objective":"Pouvoir cocher des ingrédients.","done":"La liste se garde hors connexion.","files":"public/js/courses.js"}','${at}','${at}');`);
 await page.reload();
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
 await page.locator('summary:has(> strong:text-is("Missions pour Claude Code"))').click();
 const sec=page.locator('details.fold',{has:page.locator(':scope > summary > strong:text-is("Missions pour Claude Code")')}).first();
 await expect(sec.getByText('Une mission est un texte court et complet')).toBeVisible();
 await sec.locator('summary',{hasText:'Ajouter la liste de courses'}).first().click();
 await expect(page.getByText('Règles pas encore lues')).toBeVisible();
 await expect(page.getByRole('button',{name:'Lire les règles du dépôt (lecture seule)'})).toBeVisible();
 await expect(sec.locator('pre.handoff-preview').first()).toContainText('RÈGLES DU DÉPÔT NON LUES');
 await expect(page.getByRole('button',{name:'Préparer la mission (figer le texte)'})).toBeVisible();
 await noOverflow(page,'mission brouillon');expect(await smallText(page),'texte sous 12 px').toEqual([]);
 await page.screenshot({path:`test-results/lot3-mission-${width}.png`,fullPage:true});
 // Préparer sans lire les règles : refusé tant que la case n'est pas cochée.
 await page.getByRole('button',{name:'Préparer la mission (figer le texte)'}).click();
 await expect(page.getByRole('alert')).toContainText('règles du dépôt visé');
 await page.getByLabel('Préparer quand même sans les règles du dépôt').check();
 await page.getByRole('button',{name:'Préparer la mission (figer le texte)'}).click();
 await expect(page.getByRole('button',{name:'Copier le texte exact'})).toBeVisible();
 await expect(page.getByText('Texte figé (identique à ce qui est copié)')).toBeVisible();
 await expect(page.getByText('Consommation : inconnue')).toBeVisible();
 await expect(page.getByRole('button',{name:'Acceptée',exact:true})).toBeVisible();
 await noOverflow(page,'mission figée');expect(await smallText(page),'texte sous 12 px (figée)').toEqual([]);
 await page.screenshot({path:`test-results/lot3-mission-figee-${width}.png`,fullPage:true});
 // Verdict : sans tests lus, accepter exige une raison ; « À refaire » est accepté d'un clic.
 await page.getByRole('button',{name:'Acceptée',exact:true}).click();await expect(page.getByRole('alert')).toContainText('écrivez pourquoi');
 await page.getByRole('button',{name:'À refaire',exact:true}).click();await expect(page.getByText('Verdict actuel : À refaire')).toBeVisible();
});
