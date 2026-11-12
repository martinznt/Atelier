/* Audit de référence : classement des fichiers, couverture par statut de lecture, dépendances entre PR empilées. */
export const READ_STATUS:Record<string,string>={full:'Lu intégralement',segments:'Lu par segments',metadata:'Métadonnées seulement',tool:'Analysé par outil',excluded:'Exclu (motif)',failed:'Échec de lecture',not_started:'Non commencé'};
export type FileKind='code'|'test'|'doc'|'config'|'migration'|'asset'|'other';
export function classifyRepoPath(path:string):FileKind{
 const p=path.toLowerCase(),name=p.split('/').pop()||'';
 if(/(^|\/)migrations\/.+\.sql$/.test(p))return 'migration';
 if(/(^|\/)(tests?|__tests__|e2e|spec)\//.test(p)||/\.(test|spec)\.[a-z]+$/.test(name))return 'test';
 if(/\.(md|txt|rst)$/.test(name)||/(^|\/)docs?\//.test(p))return 'doc';
 if(/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp3|mp4|pdf|zip)$/.test(name))return 'asset';
 if(/^(package(-lock)?\.json|tsconfig.*\.json|wrangler\..*|.*\.config\.[a-z]+|\..*rc|.*\.ya?ml|.*\.toml|\.gitignore|.*\.lock)$/.test(name)||/(^|\/)\.github\//.test(p))return 'config';
 if(/\.(ts|tsx|js|jsx|mjs|cjs|py|sql|css|scss|html|go|rs|java|kt|swift|php|rb|sh)$/.test(name))return 'code';
 return 'other';
}
export interface AuditFile{kind:string;read_status:string;size:number}
const READ_OK=new Set(['full','segments','tool']);
export function auditCoverage(files:AuditFile[]){
 const by:Record<string,number>={};for(const f of files)by[f.read_status]=(by[f.read_status]||0)+1;
 const code=files.filter(f=>f.kind==='code'||f.kind==='migration');
 const pct=(a:number,b:number)=>b?Math.round(a*100/b):0;
 const examined=files.filter(f=>READ_OK.has(f.read_status)).length,full=files.filter(f=>f.read_status==='full').length;
 const codeFull=code.filter(f=>f.read_status==='full').length,codeExamined=code.filter(f=>READ_OK.has(f.read_status)).length;
 const open=files.filter(f=>f.read_status==='not_started'||f.read_status==='failed').length;
 return {total:files.length,by_status:by,examined,full,percent_examined:pct(examined,files.length),percent_full:pct(full,files.length),
  code:{total:code.length,full:codeFull,examined:codeExamined,percent_full:pct(codeFull,code.length),percent_examined:pct(codeExamined,code.length)},
  not_covered:open,
  /** « Intégral » exige que chaque fichier de code soit lu intégralement et qu'aucun fichier ne reste non commencé ou en échec. */
  integral:files.length>0&&open===0&&code.length===codeFull,
  statement:files.length===0?'Aucun fichier dans le manifeste.':open===0&&code.length===codeFull?'Chaque fichier a un statut et tout le code est lu intégralement.':'Audit partiel : '+open+' fichier(s) sans lecture, '+(code.length-codeFull)+' fichier(s) de code non lus intégralement.'};
}
export interface PrNode{number:number;title:string;head:string;base:string;draft:boolean}
/** PR empilées : une PR dont la base est la branche d'une autre PR dépend de celle-ci. */
export function prGraph(prs:PrNode[],defaultBranch:string){
 const byHead=new Map(prs.map(p=>[p.head,p]));
 return prs.map(p=>{const parent=p.base!==defaultBranch?byHead.get(p.base):undefined;
  return {number:p.number,title:p.title,head:p.head,base:p.base,draft:p.draft,on_default:p.base===defaultBranch,depends_on:parent?parent.number:null,
   note:p.base===defaultBranch?'Basée sur '+defaultBranch:parent?'Empilée sur la PR #'+parent.number:'Basée sur « '+p.base+' » (aucune PR ouverte pour cette branche)'};});
}
