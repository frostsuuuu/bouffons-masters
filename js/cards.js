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
   description : texte (affiché en entier sur la carte en grand)
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
    description: "« J'arrive dans 5 minutes. » Il n'est même pas encore sous la douche.",
    attaque: 20, defense: 35,
    emoji: "⏰"
  },
  {
    id: "roi-du-canape",
    nom: "Le Roi du Canapé",
    image: "",
    rarete: "commune",
    description: "S'endort à chaque soirée avant minuit. Toujours au même endroit, toujours dans la même position.",
    attaque: 5, defense: 60,
    emoji: "🛋️"
  },
  {
    id: "accro-au-kebab",
    nom: "L'Accro au Kebab",
    image: "",
    rarete: "commune",
    description: "Connaît le patron par son prénom. Commande « comme d'hab » et ça marche.",
    attaque: 30, defense: 25,
    emoji: "🥙"
  },
  {
    id: "admin-whatsapp",
    nom: "L'Admin du Groupe",
    image: "",
    rarete: "commune",
    description: "Renomme le groupe WhatsApp toutes les semaines. Personne ne sait pourquoi.",
    attaque: 25, defense: 20,
    emoji: "💬"
  },
  {
    id: "blagues-nulles",
    nom: "Le Roi des Blagues Nulles",
    image: "",
    rarete: "rare",
    description: "Rit de ses propres blagues avant la chute. Il fallait être là. Vraiment.",
    attaque: 45, defense: 30,
    emoji: "🤡"
  },
  {
    id: "dj-autoproclame",
    nom: "Le DJ Autoproclamé",
    image: "",
    rarete: "commune",
    description: "Prend l'enceinte Bluetooth en otage dès qu'elle s'allume.",
    attaque: 50, defense: 35,
    emoji: "🎧"
  },
  {
    id: "chef-des-pates",
    nom: "Le Chef des Pâtes",
    image: "",
    rarete: "rare",
    description: "Ne sait faire qu'un seul plat. Le fait à la perfection.",
    attaque: 70, defense: 45,
    emoji: "🍝"
  },
  {
    id: "organisateur",
    nom: "L'Organisateur de Vacances",
    image: "",
    rarete: "rare",
    description: "Tableur, planning, cagnotte : rien ne lui échappe. Sauf les réservations.",
    attaque: 40, defense: 75,
    emoji: "🗺️"
  },
  {
    id: "photographe",
    nom: "Le Photographe des Soirées",
    image: "",
    rarete: "epique",
    description: "Il a toutes les photos. Elles ne doivent jamais sortir. Il le sait.",
    attaque: 85, defense: 70,
    emoji: "📸"
  },
  {
    id: "roi-des-bouffons",
    nom: "Le Roi des Bouffons",
    image: "",
    rarete: "legendaire",
    description: "Le seul, l'unique. Fondateur du groupe, gardien des traditions, maître du chaos.",
    attaque: 120, defense: 100,
    emoji: "👑"
  }
];
