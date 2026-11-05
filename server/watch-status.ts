/* Ce qu'Atelier voit et fera au prochain passage automatique (toutes les 5 minutes), PR par PR.
   Fonction pure : elle reprend, dans le même ordre, les conditions de maintenanceReviews et queueReview. */
/** Plafond de sécurité du compte quand aucun plafond d'analyses n'est choisi (protège contre une boucle). */
export const SAFETY_CEILING=100;
export type WatchState='no_config'|'off'|'no_consent'|'out_of_scope'|'analysed'|'pending'|'no_ai'|'cap'|'will_queue';
export interface WatchInput{
 config:{enabled:number;consent:number;auto_scope?:string|null;daily_limit?:number|null;no_daily_cap?:number|null}|null;
 pr:{number:number;sha:string;claude_code:boolean};
 runs:{pr_number:number;head_sha:string;status:string}[];
 todayRepo:number;todayUser:number;aiUsable:boolean;
 /** Première reprise connue quand aucune IA n'est utilisable (heure indiquée par le fournisseur ou pause de prudence). */
 aiPause?:{until:string|null;source:string|null}|null;
}
const LABELS:Record<WatchState,string>={
 no_config:'Aucun réglage enregistré pour ce dépôt.',
 off:'Analyse automatique désactivée dans les réglages.',
 no_consent:'Consentement non coché : aucune analyse automatique.',
 out_of_scope:'Ignorée : pas reconnue comme travail de Claude Code (branche « claude/… » ou mention « Generated with Claude Code » attendue).',
 analysed:'Ce commit a déjà une analyse.',
 pending:'Analyse en file ou en cours pour ce commit.',
 no_ai:'En pause : toutes les IA autorisées ont atteint leur limite ou sont indisponibles. L’analyse repart toute seule dès qu’une IA redevient utilisable.',
 cap:'En attente : plafond du jour atteint (choisissez « Sans plafond » dans les réglages pour ne plus être limité) ; reprise demain.',
 will_queue:'Sera mise en file au prochain passage (toutes les 5 minutes environ).',
};
export function watchVerdict(i:WatchInput):{state:WatchState;label:string;run_status?:string;until?:string|null;until_source?:string|null}{
 const done=(state:WatchState,run_status?:string)=>({state,label:LABELS[state],...(run_status?{run_status}:{})});
 const c=i.config;
 if(!c)return done('no_config');
 if(!c.enabled)return done('off');
 if(!c.consent)return done('no_consent');
 if(c.auto_scope==='claude_code'&&!i.pr.claude_code)return done('out_of_scope');
 const run=i.runs.find(r=>r.pr_number===i.pr.number&&r.head_sha===i.pr.sha);
 if(run)return done(run.status==='queued'||run.status==='running'?'pending':'analysed',run.status);
 if(!i.aiUsable)return {...done('no_ai'),until:i.aiPause?.until??null,until_source:i.aiPause?.source??null};
 const unlimited=c.no_daily_cap===1;
 if((!unlimited&&i.todayRepo>=(c.daily_limit||2))||i.todayUser>=(unlimited?SAFETY_CEILING:8))return done('cap');
 return done('will_queue');
}
