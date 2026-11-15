/* Lot 2 (étape A) — interface lisible : ligne d'aide sur chaque écran (G1), page « Bien utiliser Atelier » (G2),
   libellés corrigés, journal unique dans « Activité », raccourcis, aucun texte sous 12 px, aucun débordement.
   Rejoue aussi les parcours versionnables parmi les 38 (1, 2, 3, 29, 31, 32, 34, 38) : voir docs/audits/RAPPORT_LOT_2_*.md. */
import {test,expect,type Page} from '@playwright/test';
const ORIGIN='http://localhost:8787';
const MODULES=['Accueil','Pilotage','Discussions','À traiter','Mémoire','Quotas Claude Code','Projets','Fichiers','Activité','Réglages'];
async function open(page:Page,label:string){
 const btn=page.locator('.sidebar nav button',{hasText:label}).first();
 if(!(await btn.isVisible()))await page.locator('.nav-more').click();
 await page.locator('.sidebar nav button',{hasText:label}).first().click();
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
