// Extrait de index.ts pour rester testable sans monter tout le monolithe
// Deno.serve (meme convention que analyze-clothing/backgroundStyles.ts).
// Fonction PURE -- aucun effet de bord, aucun appel reseau. Template HTML
// simple, styles inline uniquement (les clients mail ignorent tres souvent
// les balises <style>) -- pas de tableau de mise en page, portee
// volontairement modeste (demande explicite : "un petit template simple").

export interface ApprovalEmailInput {
  // null si aucun profil existant au moment de l'approbation (allowlist
  // posee AVANT toute inscription) -- jamais invente, l'email reste correct
  // et cordial sans se referer a un nom qu'on ne connait pas encore.
  fullName: string | null;
  loginUrl: string;
}

const BRAND_VIOLET = "#7C5CFF";
// Adresse de contact affichee dans le pied de mail (2026-08-30) -- meme
// adresse deja utilisee comme contact support ailleurs dans l'app (voir
// App.tsx, ecran "Compte suspendu"). Sert aussi de reply-to sur l'envoi
// Resend (index.ts) : une reponse a cet email doit atterrir dans une vraie
// boite lue, jamais dans no-reply@resellosapp.com.
export const CONTACT_EMAIL = "resellosapp@gmail.com";

// Texte francais correct (accents compris -- Resend envoie en UTF-8, aucune
// raison de les retirer) mais SANS aucun caractere a risque d'affichage :
// pas d'apostrophe/guillemet typographique (' " au lieu de ' "), pas de
// backtick, pas d'emoji dans le sujet (2026-08-30, correctif suite retour
// utilisateur -- rendu peu fiable/peu professionnel selon les clients mail).
export function buildApprovalEmailSubject(): string {
  return "Ton accès à ResellOS est activé";
}

export function buildApprovalEmailHtml({ fullName, loginUrl }: ApprovalEmailInput): string {
  const greeting = fullName && fullName.trim() ? `Bonjour ${fullName.trim()},` : "Bonjour,";

  return `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #17151f;">
  <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${BRAND_VIOLET}; margin: 0 0 24px;">
    ResellOS
  </p>
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Ton accès à ResellOS est activé</h1>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${greeting}</p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
    Ton compte ResellOS vient d'être validé. Tu peux dès maintenant te connecter pour générer tes annonces,
    gérer ton stock et suivre ta comptabilité.
  </p>
  <a href="${loginUrl}" style="display: inline-block; background: ${BRAND_VIOLET}; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 12px;">
    Accéder à ResellOS
  </a>
  <p style="font-size: 13px; line-height: 1.6; color: #55516b; margin: 28px 0 0;">
    Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
    <a href="${loginUrl}" style="color: ${BRAND_VIOLET};">${loginUrl}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e2f0; margin: 28px 0 20px;">
  <p style="font-size: 12px; line-height: 1.6; color: #8a86a3; margin: 0;">
    Une question ? Écris-nous à
    <a href="mailto:${CONTACT_EMAIL}" style="color: #8a86a3;">${CONTACT_EMAIL}</a>.
  </p>
</div>
`.trim();
}
