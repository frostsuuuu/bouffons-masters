/* =========================================================
   BOUFFONS MASTERS — LISTE DES CARTES (toutes des personnages)
   ---------------------------------------------------------
   Pour ajouter une carte : copiez un bloc { ... }, collez-le
   à la fin de la liste, changez les valeurs. N'oubliez pas la
   virgule entre deux blocs.

   id          : identifiant unique, sans espace ni accent (ne plus le changer ensuite !)
   nom         : nom affiché
   image       : chemin de l'image, ex. "images/kevin.jpg" — laisser "" pour l'illustration provisoire
   rarete      : commune | rare | epique | legendaire
   attaque / defense : nombres (facultatifs — supprimez la ligne si pas de stats)
   emoji       : (facultatif) illustration provisoire tant qu'il n'y a pas d'image
   ========================================================= */
window.BM = window.BM || {};

BM.CARDS = [
  {
    id: "pote-en-retard",
    nom: "Le Pote Toujours en Retard",
    image: "",
    rarete: "commune",
    attaque: 20, defense: 35,
    emoji: "⏰"
  },
  {
    id: "roi-du-canape",
    nom: "Le Roi du Canapé",
    image: "",
    rarete: "commune",
    attaque: 5, defense: 60,
    emoji: "🛋️"
  },
  {
    id: "accro-au-kebab",
    nom: "L'Accro au Kebab",
    image: "",
    rarete: "commune",
    attaque: 30, defense: 25,
    emoji: "🥙"
  },
  {
    id: "admin-whatsapp",
    nom: "L'Admin du Groupe",
    image: "",
    rarete: "commune",
    attaque: 25, defense: 20,
    emoji: "💬"
  },
  {
    id: "blagues-nulles",
    nom: "Le Roi des Blagues Nulles",
    image: "",
    rarete: "rare",
    attaque: 45, defense: 30,
    emoji: "🤡"
  },
  {
    id: "dj-autoproclame",
    nom: "Le DJ Autoproclamé",
    image: "",
    rarete: "commune",
    attaque: 50, defense: 35,
    emoji: "🎧"
  },
  {
    id: "chef-des-pates",
    nom: "Le Chef des Pâtes",
    image: "",
    rarete: "rare",
    attaque: 70, defense: 45,
    emoji: "🍝"
  },
  {
    id: "organisateur",
    nom: "L'Organisateur de Vacances",
    image: "",
    rarete: "rare",
    attaque: 40, defense: 75,
    emoji: "🗺️"
  },
  {
    id: "photographe",
    nom: "Le Photographe des Soirées",
    image: "",
    rarete: "epique",
    attaque: 85, defense: 70,
    emoji: "📸"
  },
  {
    id: "roi-des-bouffons",
    nom: "Le Roi des Bouffons",
    image: "",
    rarete: "legendaire",
    attaque: 120, defense: 100,
    emoji: "👑"
  },
  {
    id: "killian-accart",
    nom: "Killian Accart",
    image: "images/killian-accart.jpg",
    rarete: "commune",
    attaque: 12, defense: 16
  },
  {
    id: "tayshan",
    nom: "Tayshan",
    image: "images/tayshan.jpg",
    rarete: "commune",
    attaque: 19, defense: 14
  },
  {
    id: "esteban",
    nom: "Esteban",
    image: "images/esteban.webp",
    rarete: "commune",
    attaque: 15, defense: 13
  },
  {
    id: "elouan-chauve",
    nom: "Elouan Chauve",
    image: "images/elouan-chauve.webp",
    rarete: "rare",
    attaque: 48, defense: 42
  },
  {
    id: "evan-calvitie",
    nom: "Evan Calvitie",
    image: "images/evan-calvitie.jpg",
    rarete: "epique",
    attaque: 78, defense: 72
  },
  {
    id: "seif",
    nom: "Seif",
    image: "images/seif.webp",
    rarete: "rare",
    attaque: 52, defense: 46
  },
  {
    id: "ajmol",
    nom: "Ajmol",
    image: "images/ajmol.jpg",
    rarete: "rare",
    attaque: 62, defense: 55
  }
];
