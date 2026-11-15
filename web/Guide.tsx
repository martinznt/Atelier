/* Lot 2 (étape A) — guide intégré : ligne « À quoi ça sert / La suite logique » sur chaque écran (G1),
   page « Bien utiliser Atelier » (G2) et raccourcis vers l'endroit unique d'une fonction qui existait à plusieurs endroits. */
import {createContext,useContext} from 'react';
import {ArrowUpRight,CircleHelp} from 'lucide-react';
import {SectionTitle} from './ui';

/** Aller à une rubrique ; `store` pose d'abord l'onglet voulu dans la rubrique d'arrivée (même clé que celle de l'écran). */
export type Go=(tab:string,store?:[string,string])=>void;
export const GoContext=createContext<Go>(()=>{});

export const GUIDE:Record<string,{sert:string;suite:string}>={
 home:{sert:'Voir en un coup d’œil où en est chaque projet et ce qui vous attend.',suite:'Ouvrez « À traiter » pour répondre à ce qui attend, ou « Ouvrir le pilotage » sur la carte d’un projet.'},
 pilotage:{sert:'Un espace par projet : plan, décisions, fichiers de référence et transmissions aux IA.',suite:'Ajoutez une tâche au plan, puis préparez une consigne pour Claude Code.'},
 chat:{sert:'Parler avec vos assistants IA, dans le contexte d’un projet.',suite:'Choisissez un projet, posez votre question, puis transformez une réponse en décision ou en tâche.'},
 inbox:{sert:'Tout ce qui attend une réponse ou une action de votre part.',suite:'Traitez d’abord ce qui est bloquant, puis répondez aux questions d’Atelier.'},
 memory:{sert:'Retrouver ce qui a déjà été décidé : référentiel, prompts et export ChatGPT.',suite:'Connectez le référentiel, puis cherchez avec la loupe en haut de l’écran.'},
 claude:{sert:'Suivre vos quotas Claude Code, choisir le bon modèle et noter ce que Claude Code a rendu.',suite:'Avant une mission : « Quel modèle ». À la fin : « Retours », puis « Reprise » si elle s’arrête.'},
 projects:{sert:'Créer vos projets et choisir celui sur lequel vous travaillez.',suite:'Choisissez un projet, puis ouvrez « Pilotage » pour le plan, ou « Discussions » pour parler à une IA.'},
 files:{sert:'Garder les textes et fichiers d’un projet, même sans connexion.',suite:'Choisissez un projet, puis « Créer un texte » ou « Importer ».'},
 activity:{sert:'Voir tout ce qui s’est passé : tâches en cours et journal de vos projets.',suite:'Filtrez par projet pour retrouver quand une décision ou une tâche a changé.'},
 settings:{sert:'Brancher vos comptes IA et GitHub, régler cet appareil et votre compte.',suite:'Ajoutez une connexion, puis lancez « Vérifier Atelier ».'}
};

export function Guide({tab}:{tab:string}){
 const go=useContext(GoContext),g=GUIDE[tab];if(!g)return null;
 return <aside className="guide-line" data-guide={tab} aria-label="Aide de cet écran">
  <p><strong>À quoi ça sert :</strong> {g.sert}</p>
  <p><strong>La suite logique :</strong> {g.suite}</p>
  <button type="button" className="guide-link" onClick={()=>go('help')}><CircleHelp size={15}/>Aide : bien utiliser Atelier</button>
 </aside>;
}

/** Une fonction n'a qu'un endroit principal ; ailleurs on met cette ligne qui y mène. */
export function Shortcut({to,store,label,children}:{to:string;store?:[string,string];label:string;children:React.ReactNode}){
 const go=useContext(GoContext);
 return <p className="shortcut"><span>{children}</span> <button type="button" className="guide-link" onClick={()=>go(to,store)}>{label}<ArrowUpRight size={15}/></button></p>;
}

const PARCOURS:{titre:string;pour:string;etapes:string[]}[]=[
 {titre:'1. Démarrer un projet',pour:'Pour créer l’espace de Livre de recettes ou de Sport.',etapes:[
  'Ouvrez « Pilotage » puis, si l’espace n’existe pas, « Créer l’espace » du projet (ou « Projets » → « Nouveau projet »).',
  'Dans « Où en est le projet ? », écrivez l’objectif et l’état, puis « Enregistrer ».',
  'Ouvrez « Modèle du projet » et vérifiez le gabarit de départ (Recettes, Sport, Atelier ou libre).',
  'Dans « Plan », ajoutez une phase (« Ajouter la phase ») puis une tâche (« Ajouter la tâche »).',
  'Dans « Dépôt GitHub », associez le dépôt du site. La connexion elle-même se fait dans « Réglages » → « Connexions ».']},
 {titre:'2. Transmettre une tâche à Claude Code',pour:'Pour qu’une tâche du plan devienne une consigne claire, sans rien oublier.',etapes:[
  'Dans « Pilotage » → « Plan », ouvrez la tâche et remplissez le dossier (contexte, fichiers, tests, risques), puis « Enregistrer ces détails ».',
  'Lisez le « Modèle conseillé » (Sonnet, Opus…) : il dépend de la tâche et de vos quotas.',
  'Cochez les décisions validées à citer, puis « Préparer une consigne pour Claude Code ».',
  'Ouvrez « Mémoire » → « Prompts » : copiez le texte exact. « Copié » n’est pas « Transmis ».',
  'Une fois donné à Claude Code, confirmez la transmission avec la date réelle, puis collez la réponse. Notez le retour dans « Quotas Claude Code » → « Retours ».']},
 {titre:'3. Retrouver une ancienne décision',pour:'Pour savoir ce qui a été décidé, quand et pourquoi.',etapes:[
  'Touchez la loupe en haut de l’écran et tapez un mot de la décision.',
  'Filtrez par type « Décisions » ou par statut « validée » pour réduire la liste.',
  'Ouvrez le résultat : vous voyez le projet, le statut, la source et la fiabilité.',
  'Pour l’historique d’une décision (qui l’a changée, pourquoi), ouvrez « Pilotage » → « Décisions et À trancher ».']},
 {titre:'4. Garder l’historique de vos discussions ChatGPT',pour:'Utile pour les deux sites : retrouver les idées déjà discutées.',etapes:[
  'Ouvrez « Mémoire » → « Export ChatGPT ».',
  'Choisissez le fichier ZIP de l’export officiel : il est lu sur votre appareil, rien n’est envoyé sans votre accord.',
  'Lisez le bilan chiffré (conversations, messages, dates), puis lancez l’import.',
  'Retrouvez ensuite un message exact avec la loupe : il s’ouvre surligné.']},
 {titre:'5. Suivre les fonctionnalités d’un site',pour:'Pour savoir ce qui est fait, en cours ou vérifié sur téléphone.',etapes:[
  'Dans « Pilotage », ouvrez « Suivi des fonctionnalités », écrivez un nom simple et une description, puis « Ajouter la fonctionnalité ».',
  'Ouvrez la fonctionnalité (F-0001…) et changez son état : à concevoir, en cours, fait, vérifié sur téléphone, bloqué.',
  'Pour « Vérifié », donnez une source précise et cochez « Adapté à ma demande » : sinon Atelier refuse.',
  'Retrouvez-la plus tard avec la loupe ; seul l’état « actuelle » apparaît par défaut.']}
];

export function HelpPage(){
 const go=useContext(GoContext);
 return <>
  <SectionTitle eyebrow="AIDE" title="Bien utiliser Atelier">Cinq parcours courts, écrits avec les noms exacts des écrans. Atelier prépare, suit et guide ; il n’écrit pas le code de vos sites.</SectionTitle>
  <section className="panel help-intro"><h2>Où trouver quoi</h2><ul className="plain">
   <li><strong>Une connexion (IA, GitHub)</strong> : « Réglages » → « Connexions ».</li>
   <li><strong>Importer l’historique ChatGPT</strong> : « Mémoire » → « Export ChatGPT ».</li>
   <li><strong>Passer une tâche à Claude Code</strong> : « Pilotage » → « Missions pour Claude Code » → « Nouvelle mission », puis « Copier le texte exact ». (L’ancienne « consigne » du Plan et « Mémoire » → « Prompts » existent toujours.)</li>
   <li><strong>Ce qui s’est passé</strong> : « Activité » (un seul journal, filtrable par projet).</li>
   <li><strong>Les quotas Claude Code</strong> : « Quotas Claude Code ».</li>
  </ul></section>
  {PARCOURS.map(p=><section className="panel help-path" key={p.titre}><h2>{p.titre}</h2><p className="muted">{p.pour}</p><ol>{p.etapes.map((e,i)=><li key={i}>{e}</li>)}</ol></section>)}
  <p className="shortcut"><button type="button" className="guide-link" onClick={()=>go('home')}>Retour à l’accueil<ArrowUpRight size={15}/></button></p>
 </>;
}
