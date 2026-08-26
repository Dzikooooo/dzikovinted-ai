// Mission "ROUND 5 -- RESULTAT D'UNE REPUBLICATION PROGRAMMEE" (2026-08-23) :
// traduit le `error_message` BRUT ecrit en base par l'extension
// (scheduledRepublishExecutor.ts::writeTerminalStatus) en un message
// comprehensible par un vendeur, sans jamais perdre le detail technique.
//
// Regle explicite de l'utilisateur : "error_message brut ne doit pas
// forcement etre affiche tel quel. Prevois un message UX comprehensible +
// detail technique separe si necessaire."
//
// Les motifs reconnus ci-dessous ne sont pas inventes : ils viennent des
// vrais messages produits par la chaine d'execution --
//   - buildScheduledRepublishPayload() : "Annonce introuvable (supprimee
//     depuis la programmation ?)", "Annonce sans identifiant Vinted --
//     republication impossible", "Compte Vinted introuvable (retire depuis
//     la programmation ?)"
//   - executeClaimedSchedule() : "Donnees du job incompletes apres claim",
//     "Nouvelle annonce creee mais suppression de l'ancienne non confirmee."
//   - handlers/publishListing.ts : "Onglet Vinted invalide", "Publication
//     interrompue (onglet ferme)", "HTTP <code>"
// Tout le reste retombe sur un message generique honnete -- on n'invente
// jamais une cause qu'on ne connait pas.

export interface RepublishFailureExplanation {
  // Message court, oriente vendeur -- ce qui s'est passe, sans jargon.
  message: string;
  // Ce que l'utilisateur peut faire. Absent quand il n'y a rien d'utile a
  // dire (ne jamais meubler avec un conseil bidon).
  hint?: string;
  // Reprogrammer a-t-il une chance d'aboutir ? false quand la cause est
  // structurelle (annonce supprimee, compte retire) -- proposer "Reprogrammer"
  // dans ce cas ferait echouer l'utilisateur une seconde fois.
  canReschedule: boolean;
  // Le `error_message` brut, conserve tel quel pour le detail repliable.
  // Toujours renseigne quand la base en contenait un, meme si le message UX
  // est explicite -- c'est ce qui rend un rapport de bug exploitable.
  technicalDetail?: string;
}

// Ordre significatif : premier motif qui matche gagne. Les causes
// structurelles (annonce/compte disparus) sont testees avant les causes
// d'environnement (onglet, reseau), qui sont elles-memes testees avant le
// generique.
const PATTERNS: {
  match: RegExp;
  message: string;
  hint?: string;
  canReschedule: boolean;
}[] = [
  {
    match: /annonce introuvable/i,
    message: "L'annonce n'existe plus dans ResellOS.",
    hint: "Elle a probablement été supprimée après la programmation.",
    canReschedule: false,
  },
  {
    match: /sans identifiant vinted/i,
    message: "Cette annonce n'est pas liée à une annonce Vinted.",
    hint: 'Publie-la d\'abord sur Vinted, la republication sera ensuite possible.',
    canReschedule: false,
  },
  {
    match: /compte vinted introuvable/i,
    message: 'Le compte Vinted associé n\'est plus connecté.',
    hint: 'Reconnecte le compte depuis la page Compte Vinted, puis reprogramme.',
    canReschedule: false,
  },
  {
    // Mission "RECUPERATION DES JOBS RUNNING ORPHELINS" (2026-08-25) : ecrit
    // par le sweep de l'extension quand un job est reste bloque en 'running'
    // au-dela du seuil (execution interrompue avant d'avoir pu ecrire son
    // resultat -- service worker tue, JWT expire, onglet ferme...).
    //
    // canReschedule FALSE, et c'est le point critique : on ne sait PAS si
    // l'annonce a ete republiee sur Vinted avant l'interruption. Une
    // republication n'est pas idempotente -- proposer "Reprogrammer" ici
    // creerait potentiellement un DOUBLON reel sur le compte de
    // l'utilisateur. Meme raisonnement que le cas "suppression de l'ancienne
    // non confirmee" juste en dessous.
    match: /résultat inconnu|resultat inconnu/i,
    message: "On ne sait pas si cette republication a abouti.",
    hint: "L'exécution s'est interrompue avant confirmation. Vérifie sur Vinted si l'annonce a bien été republiée avant d'en reprogrammer une.",
    canReschedule: false,
  },
  {
    match: /suppression de l'ancienne non confirm/i,
    message: "La nouvelle annonce a bien été créée, mais l'ancienne est peut-être toujours en ligne.",
    hint: 'Vérifie ton profil Vinted et supprime le doublon si besoin.',
    canReschedule: false,
  },
  {
    match: /onglet vinted invalide|onglet ferm|interrompue/i,
    message: "La republication a été interrompue avant d'aboutir.",
    hint: "L'onglet Vinted a été fermé pendant l'opération.",
    canReschedule: true,
  },
  {
    match: /délai dépassé|delai depasse|timeout/i,
    message: "Vinted n'a pas répondu à temps.",
    hint: 'Souvent temporaire — tu peux reprogrammer.',
    canReschedule: true,
  },
  {
    match: /^HTTP\s*(4\d\d|5\d\d)/i,
    message: 'Vinted a refusé la demande.',
    hint: 'Vérifie que ta session Vinted est toujours active, puis reprogramme.',
    canReschedule: true,
  },
  {
    match: /données du job incomplètes|donnees du job incompletes/i,
    message: "La programmation était incomplète et n'a pas pu être exécutée.",
    canReschedule: true,
  },
];

const GENERIC_MESSAGE = "La republication n'a pas abouti.";

export function explainRepublishFailure(rawErrorMessage: string | null | undefined): RepublishFailureExplanation {
  const raw = rawErrorMessage?.trim();

  if (!raw) {
    // L'extension a bien marque un echec mais sans message : on le dit
    // plutot que d'inventer une cause.
    return { message: GENERIC_MESSAGE, canReschedule: true };
  }

  const found = PATTERNS.find((p) => p.match.test(raw));
  if (found) {
    return {
      message: found.message,
      hint: found.hint,
      canReschedule: found.canReschedule,
      technicalDetail: raw,
    };
  }

  return { message: GENERIC_MESSAGE, canReschedule: true, technicalDetail: raw };
}
