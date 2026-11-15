/* Lot 4 — fichier de départ importable (« Atelier dans Atelier »). Règles pures, sans base de données.
   Principes : l'import ne fait QUE créer. Il ne modifie, ne remplace et ne supprime jamais rien.
   Idempotence sans migration : l'identifiant de chaque élément est dérivé (SHA-256) de l'utilisateur, du projet,
   du genre et de la clé du fichier. Importer deux fois le même fichier retombe sur les mêmes identifiants : rien n'est recréé.
   Niveaux : « Vérifié » seulement avec une source ET un test cité ; sinon « Rapporté » (ou « Hypothèse »).
   L'état « Vérifié sur téléphone » n'existe pas à l'import : seul Martin peut le poser, sur son téléphone. */
import {z} from 'zod';
import {digest} from './crypto.ts';
import {FEATURE_STATES} from './lifecycle-core.ts';

export const SEED_FORMAT='atelier-depart';
export const SEED_VERSION=1;
export const SEED_LIMITS={bytes:300_000,features:300,decisions:60};

const key=z.string().regex(/^[a-z0-9][a-z0-9._-]{1,80}$/,'Une clé est faite de lettres minuscules sans accent, de chiffres, de points, tirets ou soulignés (2 à 81 signes).');
const txt=(n:number)=>z.string().max(n).default('');
export const seedFeature=z.object({
 key,name:z.string().trim().min(1).max(140),description:txt(3000),
 state:z.enum(FEATURE_STATES).default('to_design'),
 group:txt(80),
 source_kind:z.enum(['conversation','request','repo_file','other']).default('repo_file'),
 source_ref:z.string().trim().min(3,'Chaque fonctionnalité doit citer sa source (fichier, section ou rapport).').max(300),
 reliability:z.enum(['reported','verified','hypothesis']).default('reported'),
 test_ref:txt(300)
});
export const seedDecision=z.object({key,title:z.string().trim().min(1).max(200),reason:txt(2000),source_ref:z.string().trim().min(3,'Chaque décision doit citer sa source.').max(300)});
export const seedFile=z.object({
 format:z.literal(SEED_FORMAT),version:z.literal(SEED_VERSION),
 project:z.object({name:z.string().max(120),repo:z.string().max(120).default(''),pinned_commit:z.string().regex(/^[0-9a-f]{40}$/).optional(),note:txt(500)}),
 features:z.array(seedFeature).max(SEED_LIMITS.features).default([]),
 decisions:z.array(seedDecision).max(SEED_LIMITS.decisions).default([])
});
export type SeedFile=z.infer<typeof seedFile>;
export type SeedFeature=z.infer<typeof seedFeature>;

export interface SeedProblem{kind:'feature'|'decision'|'file';key:string;message:string}
/** Contrôles qui ne tiennent pas dans le schéma : doublons de clé, « Vérifié » sans test, « Vérifié sur téléphone ». */
export function checkSeed(s:SeedFile):SeedProblem[]{
 const out:SeedProblem[]=[],seen=new Set<string>();
 for(const f of s.features){
  if(seen.has('f:'+f.key))out.push({kind:'feature',key:f.key,message:'Cette clé apparaît deux fois dans le fichier.'});seen.add('f:'+f.key);
  if(f.state==='phone_verified')out.push({kind:'feature',key:f.key,message:'« Vérifié sur téléphone » ne se pose pas à l’import : seul vous pouvez le noter, sur votre téléphone.'});
  if(f.reliability==='verified'&&f.test_ref.trim().length<3)out.push({kind:'feature',key:f.key,message:'Un niveau « Vérifié » demande un test cité (champ test_ref) : sinon l’élément doit rester « Rapporté ».'});
  if(f.reliability!=='verified'&&f.test_ref.trim())out.push({kind:'feature',key:f.key,message:'Un test est cité mais le niveau n’est pas « Vérifié » : corrigez l’un des deux (aucun niveau n’est deviné).'});
 }
 for(const d of s.decisions){if(seen.has('d:'+d.key))out.push({kind:'decision',key:d.key,message:'Cette clé apparaît deux fois dans le fichier.'});seen.add('d:'+d.key);}
 return out;
}
/** Identifiant stable au format UUID v4 (variante RFC 4122) : les routes existantes l'acceptent comme n'importe quel autre. */
export async function seedId(user:string,project:string,kind:'feature'|'decision'|'event',k:string):Promise<string>{
 const h=await digest(`atelier-depart|${user}|${project}|${kind}|${k}`);
 const v=((parseInt(h.slice(16,17),16)&0x3)|0x8).toString(16);
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${v}${h.slice(17,20)}-${h.slice(20,32)}`;
}
/** Texte de la trace d'historique : dit d'où vient l'information et qui a déclaré son niveau. */
export const importReason=(level:string)=>'Importé par vous depuis le fichier de départ (rédigé par Claude, à relire). Niveau déclaré par le fichier : '+level+'.';
