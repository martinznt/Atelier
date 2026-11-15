/* Lot 1 : parcours du téléphone — modèle du projet, fonctionnalité, « Vérifié » refusé sans source, recherche, sans débordement. */
import {test,expect} from '@playwright/test';
for(const width of [360,390])test(`modèle de projet et fonctionnalités à ${width} px`,async({page},info)=>{
 await page.setViewportSize({width,height:800});
 const email=`lot1_${width}_${Date.now().toString(36)}@example.test`;
 await page.goto('/');await page.getByRole('button',{name:'Créer un compte',exact:true}).click();await page.getByLabel('Adresse email',{exact:true}).fill(email);await page.locator('input[type="password"]').fill('test1234');await page.getByRole('button',{name:'Créer mon compte'}).click();await expect(page.getByText('Conservez vos codes de récupération')).toBeVisible();await page.getByLabel('J’ai conservé ces codes dans un endroit sûr.').check();await page.getByRole('button',{name:'Entrer dans mon atelier'}).click();
 await expect(page.getByRole('button',{name:'Recherche globale'})).toBeVisible();
 const init=await page.request.post('/api/spaces/init',{data:{template:'sport'},headers:{Origin:'http://localhost:8787'}});expect(init.ok()).toBe(true);
 await page.locator('.sidebar nav button',{hasText:'Projets'}).first().click();await page.locator('.screen-tabs').getByRole('button',{name:'Pilotage',exact:true}).click();
 const noOverflow=async(label:string)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'débordement horizontal : '+label).toBe(true);
 await page.locator('summary:has(> strong:text-is("Modèle du projet"))').click();
 await expect(page.getByText('Tout projet a le même noyau')).toBeVisible();
 await expect(page.getByLabel('Gabarit de départ')).toHaveValue('sport');
 await expect(page.getByText('Parcours pédagogique')).toBeVisible();await expect(page.getByText('emplacement vide pour l’instant')).toBeVisible();
 await noOverflow('modèle');await page.screenshot({path:`test-results/lot1-modele-${width}.png`,fullPage:true});
 await page.locator('summary:has(> strong:text-is("Suivi des fonctionnalités"))').click();
 await page.getByLabel('Nom simple').fill('Recherche de test');await page.getByLabel('Description').last().fill('Fonction créée par le test navigateur');
 await page.getByRole('button',{name:'Ajouter la fonctionnalité'}).click();
 await expect(page.getByText('F-0001 — Recherche de test')).toBeVisible();
 await page.locator('summary',{hasText:'F-0001 — Recherche de test'}).click();
 await page.locator('label.field',{hasText:/^ÉtatÀ concevoir/}).locator('select').selectOption('in_progress');await expect(page.locator('summary',{hasText:'F-0001'}).getByText('En cours')).toBeVisible();
 // « Vérifié » sans source : refusé avec un message clair
 await page.getByLabel('Niveau de fiabilité').selectOption('verified');
 // Le bouton est grisé tant que la raison manque, et l'écran le dit (défaut vu sur téléphone le 15 novembre).
 await expect(page.getByRole('button',{name:'Enregistrer le changement'})).toBeDisabled();await expect(page.getByText('Le bouton est grisé tant que le champ « Pourquoi ce changement ? » est vide')).toBeVisible();
 await page.getByLabel('Pourquoi ce changement ?').fill('Je l’ai vu');await expect(page.getByText('Le bouton est grisé')).toHaveCount(0);
 await page.getByRole('button',{name:'Enregistrer le changement'}).click();
 await expect(page.getByRole('alert')).toContainText('source précise');await expect(page.locator('summary',{hasText:'F-0001'}).getByText('Confirmé par vous')).toBeVisible();
 await noOverflow('fonctionnalité');await page.screenshot({path:`test-results/lot1-fonction-${width}.png`,fullPage:true});
 // avec source ET « adapté à ma demande » : accepté
 await page.getByLabel('Source précise').fill('tests/e2e/lot1.spec.ts');await page.getByLabel('Adapté à ma demande').check();await page.getByRole('button',{name:'Enregistrer le changement'}).click();
 await expect(page.locator('summary .rel-verified')).toBeVisible();
 // la loupe retrouve la fonctionnalité et dit d'où elle vient
 await page.getByRole('button',{name:'Recherche globale'}).click();await page.getByRole('searchbox',{name:'Recherche globale'}).fill('Recherche de test');
 await expect(page.getByText('F-0001 — Recherche de test').last()).toBeVisible();await expect(page.getByText('Source : Atelier').first()).toBeVisible();
 await noOverflow('recherche');await page.screenshot({path:`test-results/lot1-recherche-${width}.png`,fullPage:true});
});
