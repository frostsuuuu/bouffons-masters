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
    id: "killian-accart",
    nom: "Accart",
    image: "images/killian-accart.jpg",
    rarete: "commune",
    attaque: 13, defense: 17
  },
  {
    id: "tayshan",
    nom: "Tayshan",
    image: "images/tayshan.jpg",
    rarete: "commune",
    attaque: 20, defense: 14
  },
  {
    id: "esteban",
    nom: "Esté",
    image: "images/esteban.webp",
    rarete: "commune",
    attaque: 16, defense: 14
  },
  {
    id: "elouan-chauve",
    nom: "Elouan Chauve",
    image: "images/elouan-chauve.webp",
    rarete: "rare",
    attaque: 51, defense: 44
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
    attaque: 61, defense: 54
  },
  {
    id: "krimi-chatte",
    nom: "Krimi Chatte",
    image: "images/krimi-chatte.webp",
    rarete: "legendaire",
    attaque: 111, defense: 104
  },
  {
    id: "mikha-albinos",
    nom: "Mikha Albinos",
    image: "images/mikha-albinos.webp",
    rarete: "rare",
    attaque: 49, defense: 47
  },
  {
    id: "monsieur-kouaye",
    nom: "Monsieur Kouaye",
    image: "images/monsieur-kouaye.webp",
    rarete: "epique",
    attaque: 80, defense: 90
  },
  {
    id: "petit-nael-gilles-verdez",
    nom: "Naël x Gilles Verdez",
    image: "images/petit-nael-gilles-verdez.webp",
    rarete: "epique",
    attaque: 84, defense: 84
  },
  {
    id: "cousin-baveux",
    nom: "Cousin baveux",
    image: "images/cousin-baveux.jpg",
    rarete: "secrete",
    attaque: 139, defense: 126,
  },
  {
    id: "josue",
    nom: "Josué Auschwitz",
    image: "images/josue.jpg",
    rarete: "epique",
    attaque: 75, defense: 80
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
    attaque: 114, defense: 108
  },
  {
    id: "massy",
    nom: "Massy",
    image: "images/massy.webp",
    rarete: "commune",
    attaque: 16, defense: 15
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
    attaque: 82, defense: 71
  },
  {
    id: "mr-laouer",
    nom: "Mr. Laouer",
    image: "images/mr-laouer.webp",
    rarete: "rare",
    attaque: 52, defense: 50
  },
  {
    id: "paul-vrai-calvitie",
    nom: "Paul vrai calvitie",
    image: "images/paul.jpg",
    rarete: "rare",
    attaque: 55, defense: 59
  },
  {
    id: "oulmou",
    nom: "Oulmou",
    image: "images/oulmou.webp",
    rarete: "commune",
    attaque: 16, defense: 19
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
    attaque: 22, defense: 18
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
  },
  {
    id: "will",
    nom: "Will",
    image: "images/will.jpg",
    rarete: "rare",
    attaque: 59, defense: 50
  },
  {
    id: "ismael",
    nom: "Ismael",
    image: "images/ismael.jpg",
    rarete: "commune",
    attaque: 22, defense: 18
  },
  {
    id: "evan-linkedin",
    nom: "Evan Linkedin",
    image: "images/evan-linkedin.webp",
    rarete: "rare",
    attaque: 49, defense: 63
  },
  {
    id: "zuzurl",
    nom: "ZuzuRL",
    image: "images/zuzurl.jpg",
    rarete: "rare",
    attaque: 65, defense: 48
  },
  {
    id: "gp-vouille-gp-zennadi",
    nom: "GP Zennadi x GP Vouille",
    image: "images/gp-vouille-gp-zennadi.jpg",
    rarete: "legendaire",
    attaque: 113, defense: 122
  },
  {
    id: "solane-aviateur",
    nom: "Solane aviateur",
    image: "images/solane-aviateur.jpg",
    rarete: "rare",
    attaque: 59, defense: 52
  },
  {
    id: "bat",
    nom: "Bat",
    image: "images/bat.webp",
    rarete: "commune",
    attaque: 19, defense: 17
  },
  {
    id: "cerfio",
    nom: "Cerfion",
    image: "images/cerfio.webp",
    rarete: "epique",
    attaque: 82, defense: 78
  },
  {
    id: "evan-jonesy",
    nom: "Evan Jonesy",
    image: "images/evan-jonesy.webp",
    rarete: "rare",
    attaque: 51, defense: 55
  },
  {
    id: "bebe-bat-blm",
    nom: "Bébé Bat BLM",
    image: "images/bebe-bat-blm.webp",
    rarete: "rare",
    attaque: 52, defense: 51
  },
  {
    id: "hmd",
    nom: "HMD",
    image: "images/hmd.webp",
    rarete: "commune",
    attaque: 17, defense: 16
  },
  {
    id: "nabil",
    nom: "Nabil",
    image: "images/nabil.webp",
    rarete: "commune",
    attaque: 17, defense: 20
  },
  {
    id: "bebe-nael",
    nom: "Bébé Nael",
    image: "images/bebe-nael.webp",
    rarete: "rare",
    attaque: 49, defense: 51
  },
  {
    id: "krimi-pipi-chien",
    nom: "Krimi Pipi Chien",
    image: "images/krimi-pipi-chien.webp",
    rarete: "epique",
    attaque: 86, defense: 77
  },
  {
    id: "oulmou-buzz-cut",
    nom: "Oulmou Buzz Cut",
    image: "images/oulmou-buzz-cut.webp",
    rarete: "epique",
    attaque: 84, defense: 81
  },
  {
    id: "mikha",
    nom: "Mikha",
    image: "images/mikha.webp",
    rarete: "commune",
    attaque: 18, defense: 15
  },
  {
    id: "adam",
    nom: "Adam",
    image: "images/adam.webp",
    rarete: "commune",
    attaque: 16, defense: 16
  },
  {
    id: "cooki",
    nom: "Cooki",
    image: "images/cooki.jpg",
    rarete: "commune",
    attaque: 18, defense: 21
  },
  {
    id: "frosty-baillone",
    nom: "Frosty Bailloné",
    image: "images/frosty-baillone.jpg",
    rarete: "rare",
    attaque: 49, defense: 58
  },
  {
    id: "maxence-lahont",
    nom: "Maxence Lahont",
    image: "images/maxence-lahont.jpg",
    rarete: "rare",
    attaque: 53, defense: 57
  },
  {
    id: "evan-leon",
    nom: "Evan Léon",
    image: "images/evan-leon.jpg",
    rarete: "rare",
    attaque: 61, defense: 47
  },
  {
    id: "nachita",
    nom: "Nachita",
    image: "images/nachita.jpg",
    rarete: "commune",
    attaque: 15, defense: 23
  },
  {
    id: "ritchie",
    nom: "Ritchie",
    image: "images/ritchie.jpg",
    rarete: "commune",
    attaque: 23, defense: 16
  },
  {
    id: "luna",
    nom: "Luna",
    image: "images/luna.jpg",
    rarete: "commune",
    attaque: 16, defense: 20
  },
  {
    id: "mimi",
    nom: "Mimi",
    image: "images/mimi.jpg",
    rarete: "commune",
    attaque: 14, defense: 21
  },
  {
    id: "big-aubert",
    nom: "Big Aubert",
    image: "images/big-aubert.jpg",
    rarete: "legendaire",
    attaque: 110, defense: 118
  },
  {
    id: "steven",
    nom: "Steven",
    image: "images/steven.webp",
    rarete: "commune",
    attaque: 15, defense: 19
  },
  {
    id: "bat-chez-legend-hair",
    nom: "Bat chez Légend'Hair",
    image: "images/bat-chez-legend-hair.jpg",
    rarete: "epique",
    attaque: 80, defense: 78
  },
  {
    id: "krimi-petit",
    nom: "Krimi Petit",
    image: "images/krimi-petit.webp",
    rarete: "rare",
    attaque: 48, defense: 49
  },
  {
    id: "evan-enfant",
    nom: "Evan enfant",
    image: "images/evan-enfant.jpg",
    rarete: "commune",
    attaque: 17, defense: 15
  },
  {
    id: "nael-enfant",
    nom: "Nael enfant",
    image: "images/nael-enfant.jpg",
    rarete: "commune",
    attaque: 16, defense: 21
  },
  {
    id: "mathis-enfant",
    nom: "Mathis enfant",
    image: "images/mathis-enfant.jpg",
    rarete: "commune",
    attaque: 20, defense: 18
  },
  {
    id: "tayshan-enfant",
    nom: "Tayshan enfant",
    image: "images/tayshan-enfant.jpg",
    rarete: "commune",
    attaque: 23, defense: 15
  }
];
