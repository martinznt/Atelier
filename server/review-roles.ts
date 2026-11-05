/* Rôle de chaque outil qui reçoit un rapport, et détection du travail de Claude Code. Module pur, sans réseau. */
export type TransmissionRole='claude_code'|'chatgpt';

export const roleTitle:Record<TransmissionRole,string>={
 claude_code:'Pour Claude Code — rôle : reproduire, corriger de façon ciblée, tester',
 chatgpt:'Pour ChatGPT — rôle : avis indépendant, incertitudes, tests de vérification'
};
/** Instructions adaptées au rôle de chaque outil. Atelier ne lance aucun agent : ce texte est lu par l'outil ou collé par l'utilisateur. */
export const roleIntro:Record<TransmissionRole,string>={
 claude_code:'Tu reprends un dossier de revue de PR généré par Atelier (analyse automatisée par plusieurs IA, non vérifiée).\nConsignes :\n1. Lis le dossier : problème, contexte, fichiers concernés, limites de l’analyse.\n2. Pour chaque anomalie, reproduis d’abord le problème par un test. Une anomalie non reproduite n’est pas un bug.\n3. Corrige uniquement ce qui est reproduit, de façon ciblée, dans les fichiers concernés.\n4. Ajoute ou mets à jour les tests, lance les tests ciblés puis la CI.\n5. Aucune modification hors périmètre : pas de refactorisation, de dépendance, de configuration ni de fichier non concerné.\n6. Indique ce que tu n’as pas pu vérifier.\n\n',
 chatgpt:'Voici un dossier de revue de PR généré par Atelier (analyse automatisée, non vérifiée). Tu n’as pas accès à mon dépôt ni aux tests : donne un avis indépendant à partir de ce dossier.\nConsignes :\n1. Évalue le contexte technique et la plausibilité de chaque anomalie.\n2. Signale tes incertitudes et ce qu’on ne peut pas conclure.\n3. Propose les tests ou vérifications qui permettraient de trancher.\n4. Signale les risques d’architecture, de sécurité ou d’ergonomie que les IA de revue n’ont pas vus.\n5. Ne considère aucune anomalie comme prouvée et ne demande ni clé ni secret.\n\n'
};

/** PR issue du travail de Claude Code : branche `claude/…` ou mention explicite dans la description. Heuristique : une autre convention de nom n'est pas reconnue. */
export function isClaudeCodeWork(pr:{head?:{ref?:string}|null;body?:string|null}|null|undefined):boolean{
 if(!pr)return false;
 const ref=String(pr.head?.ref||'');
 if(/^claude\//i.test(ref))return true;
 const body=String(pr.body||'').slice(0,20000);
 return /claude\.ai\/code/i.test(body)||/Generated with \[?Claude Code/i.test(body);
}
