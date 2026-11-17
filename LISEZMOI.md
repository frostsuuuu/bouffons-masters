# Bouffons Masters — V1

Jeu de cartes à collectionner entre potes. Ouvrez `index.html` dans votre navigateur (double-clic), c'est tout.

## Les fichiers

```
bouffons-masters/
├── index.html        la page (pas besoin d'y toucher)
├── supabase/schema.sql  ← le serveur (à coller une fois dans Supabase)
├── images/           vos images de cartes + le logo
├── css/style.css     le design (couleurs du site en haut du fichier)
└── js/
    ├── cards.js      ← LA LISTE DES CARTES (c'est ici que vous travaillerez le plus)
    ├── config.js     ← LES RÉGLAGES (raretés, taux, boosters par jour, fusion)
    ├── supabase-config.js ← L'ADRESSE ET LA CLÉ DU SERVEUR (mode en ligne)
    ├── storage.js    sauvegarde locale (cache)
    ├── online.js     tout ce qui parle au serveur
    ├── social.js     onglet Social (amis, profils, échanges)
    ├── game.js       règles du jeu (tirages, fusion, limite quotidienne)
    └── app.js        affichage et animations
```

## Ajouter une carte

1. Ouvrez `js/cards.js` avec n'importe quel éditeur de texte (VS Code recommandé, gratuit).
2. Copiez un bloc complet `{ ... },` et collez-le avant le `];` final.
3. Changez les valeurs :

```js
{
  id: "tonton-bricoleur",         // unique, sans espace ni accent, ne plus le changer ensuite
  nom: "Tonton Bricoleur",
  image: "images/tonton.jpg",     // ou "" pour l'illustration provisoire
  rarete: "rare",                 // commune | peu_commune | rare | epique | legendaire
  description: "A tout réparé avec du scotch. Même la voiture.",
  attaque: 60, defense: 40,       // facultatif
  emoji: "🔧"                     // facultatif : illustration tant qu'il n'y a pas d'image
},
```

4. Sauvez et rechargez la page. S'il y a une erreur (id en double, rareté mal écrite…), un bandeau rouge en haut du site vous dit laquelle.

## Changer une image

1. Mettez l'image dans le dossier `images/` (format paysage 4:3 idéal, ex. 800×600, en .jpg, .png ou .webp).
2. Dans `cards.js`, mettez son chemin dans la carte : `image: "images/tonton.jpg"`.
3. Rechargez. Si le fichier est introuvable, l'illustration provisoire s'affiche à la place.

## Réglages utiles (`js/config.js`)

- `rechargeMinutes` : un booster gagné toutes les X minutes (30 par défaut).
- `boostersMax` : nombre max de boosters en réserve (3 par défaut ; 1 = un seul à la fois).
- `retournementAuto` : `false` = on touche chaque carte pour la retourner ; `true` = elles se retournent toutes seules.
- `modeTest: true` : boosters illimités, pratique pour tester vos nouvelles cartes.
- `raretes` : nom, couleur et `poids` (chance d'apparition) de chaque rareté.
- `garantieDerniereCarte` : rareté minimum de la 5e carte du booster.
- `fusion.etoilesMax` et `fusion.bonusParEtoile` : fusion (une carte de booster n'a pas d'étoile ; chaque fusion ajoute 1 étoile).
- `raretes[].couleur` : couleur du cadre ET de l'aura quand la carte sort du booster.

Au premier lancement, le joueur crée son compte en choisissant un pseudo (définitif). Le bouton « Supprimer » (page Profil) efface le compte et la collection de ce navigateur.

## Prévu pour la suite

- **Monnaie** : le champ `coins` existe déjà dans la sauvegarde, et `config.monnaie` est prêt à être activé.
- **Comptes en ligne, échanges, enchères** : le compte a déjà un identifiant unique (`account.id`), et toute la sauvegarde passe par `storage.js`. Pour passer à un serveur, on remplacera seulement ce fichier. Les `id` de cartes stables serviront de référence commune.
- **Page admin** : les cartes sont de simples objets ; un formulaire pourra produire exactement le même format.


## Mettre le jeu en ligne (onglet Social, échanges)

Sans serveur, le jeu marche mais chacun joue dans son coin. Avec Supabase (gratuit), les comptes, collections, amis et échanges sont partagés. Comptez 10 minutes, une seule fois.

### 1. Créer le serveur Supabase
1. Allez sur **supabase.com** → *Start your project* → connectez-vous (GitHub ou e-mail).
2. *New project* : nom `bouffons-masters`, un mot de passe de base de données (gardez-le), région **Europe** (Paris ou Francfort). Attendez ~2 minutes.
3. Menu de gauche **SQL Editor** → *New query* → collez TOUT le contenu de `supabase/schema.sql` → **Run**. Vous devez voir « Success ».
4. **Authentication** → *Sign In / Providers* → activez **Allow anonymous sign-ins** → *Save*. (Le jeu crée un compte anonyme par navigateur, relié au pseudo : pas de mot de passe ni d'e-mail.)
5. **Project Settings** → *API Keys* (ou *API*) : copiez l'**URL du projet** et la clé **anon public** (ou *publishable*).
6. Collez-les dans `js/supabase-config.js` :
   ```js
   url: "https://xxxxxxxx.supabase.co",
   cle: "eyJhbGciOi..."
   ```
   ⚠️ Ne mettez JAMAIS la clé `service_role` / *secret* dans le code : elle donne tous les droits.

### 2. Héberger le site (Netlify, gratuit)
1. Créez un compte sur **netlify.com**.
2. Allez sur **app.netlify.com/drop** et glissez-déposez le dossier `bouffons-masters` entier.
3. Vous obtenez une adresse du type `https://nom-au-hasard.netlify.app` : c'est le lien à donner à vos amis. (*Site configuration* → *Change site name* pour la personnaliser.)
4. Pour mettre à jour le site : *Deploys* → glissez à nouveau le dossier.

### À savoir
- Le compte est lié au **navigateur** : si un joueur efface les données de son navigateur ou change d'appareil, il perd l'accès à son compte (le pseudo reste réservé). On pourra ajouter plus tard une connexion par e-mail pour récupérer son compte.
- Le pseudo est définitif : le serveur refuse toute modification.
- Les collections ne changent que par le serveur (boosters, fusions, échanges validés). Un joueur très motivé pourrait tricher sur les boosters (le tirage se fait dans le navigateur) : suffisant entre amis, à renforcer si le jeu grandit.
- Un projet Supabase gratuit se met en pause après 7 jours sans aucune visite : il suffit de le relancer depuis le tableau de bord.
- **Phase de test** : `config.js` donne 1 booster par minute sans limite de réserve. Pensez à remettre des valeurs normales avant de lancer le vrai jeu.
