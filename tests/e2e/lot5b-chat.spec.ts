/* Lot 5B (5B-5) — discussion liée à la maquette, dans le vrai navigateur contre le Worker local (360 et 390 px).
   Aucune vraie clé d'IA ici : la demande à une IA est essayée avec une clé FACTICE et doit échouer proprement (rien d'ajouté, rien de rejoué).
   La réponse d'une vraie IA reste NON PROUVÉE. */
import {test,expect,type Page} from './fixtures';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const ORIGIN='http://localhost:8787';
const sql=(q:string)=>execFileSync('npx',['wrangler','d1','execute','atelier-db','--local','--command',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const noOverflow=async(page:Page,label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement : '+label).toBe(true);
const smallText=(page:Page)=>page.evaluate(()=>{const bad:string[]=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n:Node|null;while((n=w.nextNode())){const t=(n.textContent||'').trim();const el=n.parentElement;if(!t||!el)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const px=parseFloat(cs.fontSize);if(px>0&&px<12)bad.push(t.slice(0,40)+' '+px);}return bad;});
const proof=async(loc:any,name:string)=>{mkdirSync('test-results/preuves',{recursive:true});await loc.screenshot({path:`test-results/preuves/${name}.png`,scale:'css',animations:'disabled'});};
const post=(page:Page,url:string,data:any)=>page.request.post(url,{data,headers:{Origin:ORIGIN}});

for(const width of [360,390])test(`Discussion : question, réponse sans IA, conclusion confirmée à ${width} px`,async({page})=>{
 test.setTimeout(240000);
 await page.setViewportSize({width,height:800});
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(`lot5b_chat_${width}_${Date.now().toString(36)}@example.test`);await page.locator('input[type="password"]').fill('test1234-lot5b');await page.locator('form button').last().click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible({timeout:20000});
 const project=(await (await post(page,'/api/projects',{name:'Livre de recettes (essai)'})).json()).id;
 const me=(await (await page.request.get('/api/auth/me')).json()).user.id as string,at=new Date().toISOString();
 sql(`INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,created_at,updated_at) VALUES('${crypto.randomUUID()}','${me}','${project}','La recherche reste en haut','Martin la cherche tout de suite','validated','${at}','${at}');`);
 // une connexion Mistral avec une clé FACTICE (aucune vraie clé dans cet essai)
 const conn=await (await post(page,'/api/connections',{provider:'mistral',label:'Mistral (clé factice)',secret:'cle-factice-pour-essai-2026',scopes:['chat'],api_consent:true})).json();
 sql(`UPDATE connections SET status='connected',models='["ministral-test"]' WHERE id='${conn.id}';`);
 await page.reload();mkdirSync('test-results',{recursive:true});const shot=`test-results/lot5b-chat-capture-${width}.png`;await page.screenshot({path:shot});
 const mk=await (await post(page,'/api/mockups',{project_id:project,title:'Accueil',page_name:'Accueil'})).json();
 const open=async()=>{
  await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
  await page.getByText('Livre de recettes (essai)',{exact:true}).first().click();
  await page.locator('summary:has(> strong:text-is("Maquettes d’écran"))').click();await page.locator('details.fold:has(> summary:has-text("Accueil"))').first().locator('> summary').click();
 };
 await open();await page.locator('input[type="file"][accept="image/*"]').setInputFiles(shot);await expect(page.getByText(/^Capture enregistrée : /)).toBeVisible({timeout:30000});
 for(const b of [{kind:'title',label:'Titre',x:16,y:40,w:328,h:40},{kind:'field',label:'Recherche',x:16,y:88,w:328,h:40}])expect((await post(page,`/api/mockups/${mk.id}/blocks`,b)).ok()).toBe(true);
 await page.reload();await open();
 const chat=page.locator('.mq-chat');
 // (1) question sur un bloc → réponse d'Atelier SANS IA, sourcée
 await chat.getByLabel('Question sur…').selectOption({label:'2. Recherche'});
 await chat.getByLabel('Votre question').fill('Si je mets la recherche sous le titre, est-ce bien ?');
 await chat.getByRole('button',{name:'Demander à Atelier'}).click();
 const ans=chat.locator('.mq-msg.atelier').first();
 await expect(ans).toContainText('Ce qu\'Atelier sait déjà sur « Recherche », sans IA :');
 await expect(ans).toContainText('Champ à 16 px du bord gauche et 88 px du haut, 328 × 40 px');
 await expect(ans).toContainText('« Recherche » est petit pour un pouce');await expect(ans).toContainText('[Vérifié]');
 await expect(ans).toContainText('Décision actuelle « La recherche reste en haut » : Martin la cherche tout de suite');await expect(ans).toContainText('[Confirmé par vous]');
 await noOverflow(page,'discussion '+width);expect(await smallText(page),'texte sous 12 px').toEqual([]);
 if(width===360)await proof(chat.locator('.mq-msgs'),'5b5-01-reponse-sans-ia');
 // (2) demande à une IA avec une clé FACTICE : échec propre, rien n'est ajouté
 const before=await chat.locator('.mq-msg').count();
 await chat.getByRole('button',{name:'Demander l’avis d’une IA'}).click();
 await expect(page.getByRole('alert')).toContainText('L’IA n’a pas répondu correctement. Rien n’a été ajouté et la demande n’est pas rejouée automatiquement.',{timeout:60000});
 await expect(chat.locator('.mq-msg')).toHaveCount(before);
 if(width===360)await proof(page.getByRole('alert'),'5b5-02-ia-cle-factice-echec-propre');
 // (3) conclusion confirmée par Martin → marquée et reprise dans la fiche
 await ans.getByRole('button',{name:'Confirmer une conclusion'}).click();
 await chat.getByLabel('Votre conclusion (avec vos mots)').fill('La recherche reste juste sous le titre, en 44 px de haut.');
 await chat.getByRole('button',{name:'Confirmer',exact:true}).click();
 await expect(page.getByText('Conclusion confirmée : elle entre dans la fiche et la mission.')).toBeVisible();
 const concl=chat.locator('.mq-msg.concl');await expect(concl).toContainText('✔ Confirmé par vous');await expect(concl).toContainText('La recherche reste juste sous le titre, en 44 px de haut.');
 if(width===360)await proof(concl,'5b5-03-conclusion-confirmee');
 await page.getByRole('button',{name:'Préparer la fiche'}).click();const sheet=page.locator('.mq-sheet');await sheet.locator('summary',{hasText:'Texte complet de la fiche'}).click();
 const md=await sheet.locator('pre').innerText();expect(md).toContain('## Conclusions confirmées par vous (discussion)');expect(md).toContain('- La recherche reste juste sous le titre, en 44 px de haut.');
 if(width===360)await proof(sheet.locator('pre'),'5b5-04-fiche-avec-conclusion');
 // (4) tout est gardé : après rechargement, la discussion est là
 await page.reload();await open();await expect(chat.locator('.mq-msg')).toHaveCount(3);
});
