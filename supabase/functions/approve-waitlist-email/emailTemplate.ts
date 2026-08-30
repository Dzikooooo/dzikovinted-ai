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

export function buildApprovalEmailSubject(): string {
  return "Ton accès à ResellOS est ouvert 🎉";
}

export function buildApprovalEmailHtml({ fullName, loginUrl }: ApprovalEmailInput): string {
  const greeting = fullName && fullName.trim() ? `Salut ${fullName.trim()},` : "Salut,";

  return `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #17151f;">
  <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${BRAND_VIOLET}; margin: 0 0 24px;">
    ResellOS
  </p>
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Ton accès est ouvert</h1>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${greeting}</p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
    Bonne nouvelle : ton compte ResellOS vient d'être validé. Tu peux dès maintenant te connecter et commencer à
    générer tes annonces, gérer ton stock et suivre ta comptabilité.
  </p>
  <a href="${loginUrl}" style="display: inline-block; background: ${BRAND_VIOLET}; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 12px;">
    Me connecter à ResellOS
  </a>
  <p style="font-size: 13px; line-height: 1.6; color: #55516b; margin: 32px 0 0;">
    Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br>
    <a href="${loginUrl}" style="color: ${BRAND_VIOLET};">${loginUrl}</a>
  </p>
</div>
`.trim();
}
