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
  },
  {
    id: "krimi-chatte",
    nom: "Krimi Chatte",
    image: "images/krimi-chatte.webp",
    rarete: "epique",
    attaque: 82, defense: 74
  },
  {
    id: "mikha-albinos",
    nom: "Mikha Albinos",
    image: "images/mikha-albinos.webp",
    rarete: "rare",
    attaque: 50, defense: 47
  },
  {
    id: "monsieur-kouaye",
    nom: "Monsieur Kouaye",
    image: "images/monsieur-kouaye.webp",
    rarete: "epique",
    attaque: 76, defense: 85
  },
  {
    id: "petit-nael-gilles-verdez",
    nom: "Petit Nael x Gilles Verdez",
    image: "images/petit-nael-gilles-verdez.webp",
    rarete: "epique",
    attaque: 80, defense: 80
  },
  {
    id: "cousin-baveux",
    nom: "Cousin baveux",
    image: "images/cousin-baveux.jpg",
    rarete: "legendaire",
    attaque: 115, defense: 105,
  },
  {
    id: "josue",
    nom: "Josué Auschwitz",
    image: "images/josue.jpg",
    rarete: "epique",
    attaque: 74, defense: 79
  },
  {
    id: "yass-merguez",
    nom: "Yass Merguez",
    image: "images/yass-merguez.webp",
    rarete: "rare",
    attaque: 55, defense: 49
  },
  {
    id: "krimi-jeu-des-memes",
    nom: "Krimi Jeu des Mèmes",
    image: "images/krimi-jeu-des-memes.webp",
    rarete: "legendaire",
    attaque: 115, defense: 108
  },
  {
    id: "massy",
    nom: "Massy",
    image: "images/massy.webp",
    rarete: "commune",
    attaque: 17, defense: 15
  },
  {
    id: "quentin-bedo",
    nom: "Quentin Bédo",
    image: "images/quentin-bedo.webp",
    rarete: "rare",
    attaque: 46, defense: 53
  },
  {
    id: "tony-draou-bossu",
    nom: "Tony Draou Bossu",
    image: "images/tony-draou-bossu.webp",
    rarete: "epique",
    attaque: 81, defense: 70
  },
  {
    id: "mr-laouer",
    nom: "Mr. Laouer",
    image: "images/mr-laouer.webp",
    rarete: "rare",
    attaque: 51, defense: 50
  },
  {
    id: "paul-vrai-calvitie",
    nom: "Paul vrai calvitie",
    image: "images/paul.jpg",
    rarete: "rare",
    attaque: 55, defense: 60
  },
  {
    id: "oulmou",
    nom: "Oulmou",
    image: "images/oulmou.webp",
    rarete: "commune",
    attaque: 16, defense: 18
  },
  {
    id: "tsm",
    nom: "TSM",
    image: "images/tsm.webp",
    rarete: "commune",
    attaque: 18, defense: 13
  },
  {
    id: "frosty",
    nom: "Frosty",
    image: "images/frosty.webp",
    rarete: "commune",
    attaque: 20, defense: 17
  },
  {
    id: "le-bottier",
    nom: "Le Bottier",
    image: "images/le-bottier.webp",
    rarete: "commune",
    attaque: 14, defense: 19
  },
  {
    id: "laps-chose",
    nom: "Laps Chose",
    image: "images/laps-chose.webp",
    rarete: "rare",
    attaque: 47, defense: 54
  },
  {
    id: "aylann",
    nom: "Aylann",
    image: "images/aylann.webp",
    rarete: "commune",
    attaque: 19, defense: 16
  }
];
