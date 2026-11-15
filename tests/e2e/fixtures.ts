/* Chaque test navigateur s'inscrit avec sa propre adresse IP annoncée (en-tête CF-Connecting-IP, que Cloudflare impose en production).
   Sans cela, la limite de 10 inscriptions par quart d'heure et par adresse fait échouer tous les tests au-delà du dixième (vu en CI le 15 novembre). */
import {test as base,expect} from '@playwright/test';
export type {Page} from '@playwright/test';
export const test=base.extend({
 context:async({context},use)=>{
  const r=()=>Math.floor(Math.random()*254)+1;
  await context.setExtraHTTPHeaders({'CF-Connecting-IP':`10.${r()}.${r()}.${r()}`});
  await use(context);
 }
});
export {expect};
