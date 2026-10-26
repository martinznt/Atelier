/**
 * Retourner un diagnostic actionnable sans divulguer SQL, clés, pile d'appels
 * ou contenu d'une requête privée. Une opération de sauvegarde peut être
 * partiellement terminée : jamais de faux succès ni de relance automatique.
 */
export function operationalFailure(error:unknown):{status:503|500;code:string;message:string}{
 const message=error instanceof Error?error.message:'';
 if(/MASTER_KEY manquante ou invalide/.test(message)){
  return {status:503,code:'MISSING_MASTER_KEY',message:'Le secret de chiffrement MASTER_KEY est absent ou invalide dans le Worker Cloudflare. Ouvrez Réglages → Connexions → Vérifier Atelier. Ne remplacez pas une clé existante.'};
 }
 if(/(?:no such table:|no such column:|has no column named\\b)/i.test(message)){
  return {status:503,code:'D1_MIGRATION_REQUIRED',message:'Le schéma de la base Cloudflare D1 ne correspond pas au code publié. Ouvrez Réglages → Connexions → Vérifier Atelier ; sauvegardez D1 avant d’appliquer uniquement les migrations manquantes. Ne recréez pas la base.'};
 }
 if(/database.*(?:is locked|busy|temporarily unavailable)/i.test(message)){
  return {status:503,code:'D1_TEMPORARILY_UNAVAILABLE',message:'La base D1 est temporairement indisponible. Vérifiez l’état Cloudflare et l’opération précédente avant toute nouvelle tentative.'};
 }
 return {status:500,code:'UNEXPECTED_SERVER_ERROR',message:'Une erreur interne d’Atelier s’est produite. Vérifiez le diagnostic du site et les journaux du Worker avant de réessayer. Une opération interrompue peut avoir été partiellement enregistrée.'};
}
