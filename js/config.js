/* =========================================================
   BOUFFONS MASTERS — RÉGLAGES DU JEU
   ---------------------------------------------------------
   Tout ce qui se règle (raretés, taux, recharge des boosters,
   fusion) est ici. Modifiez les valeurs, sauvez, rechargez la
   page : c'est tout.
   ========================================================= */
window.BM = window.BM || {};

BM.CONFIG = {
  nomDuJeu: "Bouffons Masters",

  /* ---------- Boosters ---------- */
  cartesParBooster: 5,
  // PHASE DE TEST : 1 booster par minute, réserve illimitée.
  rechargeMinutes: 20,         // 1 booster gagné toutes les X minutes
  boostersMax: 5,              // nombre max en réserve (null = illimité)
  boostersDepart: 5,           // boosters offerts à la création du compte
  modeTest: false,             // true = boosters illimités (pratique pour tester vos cartes)

  // true = chaque carte du paquet se retourne toute seule après un délai
  // false = il faut toucher chaque carte pour la retourner
  retournementAuto: true,
  delaiRetournement: 350,      // ms pendant lesquels la carte reste de dos avant de se retourner

  // La dernière carte de chaque booster est au moins de cette rareté.
  // Mettre null pour désactiver la garantie.
  garantieDerniereCarte: "rare",

  /* ---------- Raretés ----------
     "poids" = chance d'apparition. Ce ne sont pas forcément des %,
     seul le rapport entre les nombres compte (60 vs 1 = 60 fois plus fréquent).
     "couleur" = couleur du cadre ET de l'aura quand la carte sort du booster.
     L'ordre de la liste = de la plus commune à la plus rare. */
  raretes: [
    { id: "commune",     nom: "Commune",     couleur: "#3ee08f", poids: 70 },
    { id: "rare",        nom: "Rare",        couleur: "#3fa9ff", poids: 22 },
    { id: "epique",      nom: "Épique",      couleur: "#c05cff", poids: 6 },
    { id: "legendaire",  nom: "Légendaire",  couleur: "#ffa726", poids: 2 },
    // Rareté secrète : invisible dans le jeu tant qu'aucune carte n'y est rangée (rarete: "secrete")
    { id: "secrete",     nom: "Secrète",     couleur: "#c9c9d6", poids: 0.5 }
  ],

  /* Toutes les cartes sont des personnages : pas de catégories. */
  emojiParDefaut: "🧑",        // illustration provisoire d'une carte sans image ni emoji

  /* ---------- Fusion ----------
     2 exemplaires identiques (même nombre d'étoiles) → la carte gagne 1 étoile.
     Une carte sortie d'un booster n'a pas d'étoile. */
  fusion: {
    etoilesMax: 6,              // 3 étoiles dorées, puis 3 étoiles arc-en-ciel (2 cartes ★★★ dorées → 1 ★ arc-en-ciel)
    etoilesParCouleur: 3,       // nombre d'étoiles dorées avant de passer à l'arc-en-ciel
    bonusParEtoile: 0.25        // +25 % d'attaque / défense par palier (une ★ arc-en-ciel compte comme le 4e palier)
  },

  /* ---------- Compte & social ---------- */
  pseudo: { min: 3, max: 16 },
  vitrineMax: 5,               // nombre de cartes dans la vitrine du profil

  /* ---------- Collection ---------- */
  afficherNomCartesManquantes: false,   // true = on voit le nom des cartes pas encore obtenues

  /* ---------- Monnaie (désactivée pour l'instant) ---------- */
  monnaie: { active: false, nom: "Pièces" },

  /* ---------- Technique ---------- */
  cleSauvegarde: "bouffons-masters-save-v1"
};
