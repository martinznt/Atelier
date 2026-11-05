/* Marque de titre : « EN VÉRIFICATION — Version 4.6.0 … » est analysée, « A FUSIONNER — … » ne l'est pas.
   Comparaison sans accents ni casse, au début du titre ; crochets, parenthèses et espaces de tête ignorés. */
const fold=(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function hasMark(title:string|null|undefined,mark:string|null|undefined):boolean{
 const m=fold(String(mark||''));
 if(!m)return true;
 const t=fold(String(title||'')).replace(/^[\s\[\]()#*_>-]+/,'');
 return t.startsWith(m);
}
