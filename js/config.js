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

  /* ---------- Tour Infernale : pack récompense selon l'étage atteint ----------
     À chaque montée (en ligne), on gagne le pack du palier atteint : plus de cartes ET de meilleurs taux.
     « etage » = étage atteint minimum ; « fin » = tour finie. « poids » = chances par rareté (comme raretes),
     « garantie » = rareté minimum de la dernière carte du pack. Recopié sur le serveur à l'ouverture du jeu par un admin.
     Pour comparer, un booster normal : commune 70 · rare 22 · épique 6 · légendaire 2 · secrète 0,5. */
  tour: {
    paliers: [
      { etage: 10, cartes: 3,  nom: "Pack Tour I",    garantie: "rare",       poids: { commune: 65, rare: 25, epique: 7,  legendaire: 2.5, secrete: 0.5 } },
      { etage: 20, cartes: 4,  nom: "Pack Tour II",   garantie: "rare",       poids: { commune: 60, rare: 27, epique: 9,  legendaire: 3.3, secrete: 0.7 } },
      { etage: 30, cartes: 5,  nom: "Pack Tour III",  garantie: "rare",       poids: { commune: 55, rare: 29, epique: 11, legendaire: 4,   secrete: 1 } },
      { etage: 40, cartes: 6,  nom: "Pack Tour IV",   garantie: "rare",       poids: { commune: 50, rare: 31, epique: 13, legendaire: 5,   secrete: 1 } },
      { etage: 50, cartes: 7,  nom: "Pack Tour V",    garantie: "rare",       poids: { commune: 45, rare: 32, epique: 16, legendaire: 6,   secrete: 1 } },
      { etage: 60, cartes: 8,  nom: "Pack Tour VI",   garantie: "rare",       poids: { commune: 40, rare: 33, epique: 19, legendaire: 6.5, secrete: 1.5 } },
      { etage: 70, cartes: 9,  nom: "Pack Tour VII",  garantie: "epique",     poids: { commune: 35, rare: 34, epique: 22, legendaire: 7,   secrete: 2 } },
      { fin: true, cartes: 10, nom: "Pack Infernal",  garantie: "legendaire", poids: { commune: 25, rare: 35, epique: 27, legendaire: 10,  secrete: 3 } }
    ]
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
