/* =========================================================
   LOGIQUE DU JEU (pas d'affichage ici)
   Compte, boosters (recharge), collection, fusion.
   Niveau interne : 1 = sans étoile, 2 = ★, 3 = ★★ …
   ========================================================= */
window.BM = window.BM || {};

BM.Game = (function () {
  const C = BM.CONFIG;
  const CARDS = BM.CARDS;
  let state = null;

  /* ---------- Utilitaires ---------- */
  const INTERVAL = () => C.rechargeMinutes * 60000;
  const MAX_LEVEL = () => C.fusion.etoilesMax + 1;
  const CAP = () => (C.boostersMax == null ? Infinity : C.boostersMax);
  const starsOf = (level) => Math.max(0, level - 1);
  const rarityIndex = (id) => C.raretes.findIndex((r) => r.id === id);
  const rarity = (id) => C.raretes.find((r) => r.id === id) || C.raretes[0];
  const card = (id) => CARDS.find((c) => c.id === id);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- Vérification du fichier de cartes ---------- */
  function validate() {
    const errors = [];
    const seen = new Set();
    CARDS.forEach((c, i) => {
      const label = c.nom ? `« ${c.nom} »` : `n°${i + 1}`;
      if (!c.id) errors.push(`La carte ${label} n'a pas d'id.`);
      else if (seen.has(c.id)) errors.push(`L'id « ${c.id} » est utilisé par deux cartes.`);
      seen.add(c.id);
      if (!c.nom) errors.push(`La carte ${label} n'a pas de nom.`);
      if (rarityIndex(c.rarete) < 0) errors.push(`La carte ${label} a une rareté inconnue : « ${c.rarete} ».`);
    });
    return errors;
  }

  /* ---------- État / sauvegarde ---------- */
  function fresh() {
    return {
      version: 1,
      collection: {},                     // { idCarte: { "1": nbExemplaires, "2": ... } }
      account: null,                      // { id, pseudo, createdAt } — créé au premier lancement
      boosters: { stock: C.boostersMax == null ? (C.boostersDepart ?? 5) : C.boostersMax, last: Date.now() },
      vitrine: [],                        // ids des cartes mises en avant sur le profil
      pending: [],                        // cartes pas encore envoyées au serveur
      stats: { boosters: 0, fusions: 0, cartes: 0 },
      coins: 0,                           // réservé pour la future monnaie
      createdAt: Date.now()
    };
  }
  function load() {
    const saved = BM.Storage.load();
    state = Object.assign(fresh(), saved || {});
    state.stats = Object.assign(fresh().stats, state.stats || {});
    if (!state.boosters || typeof state.boosters.stock !== "number") state.boosters = fresh().boosters;
    delete state.daily; delete state.pseudo; // anciens champs
    if (!Array.isArray(state.vitrine)) state.vitrine = [];
    if (!Array.isArray(state.pending)) state.pending = [];
    refill();
  }
  function save() { BM.Storage.save(state); }
  function reset() { BM.Storage.clear(); state = fresh(); save(); }

  /* ---------- Compte ---------- */
  function hasAccount() { return !!(state.account && state.account.pseudo); }
  function checkPseudo(p) {
    p = String(p || "").trim().replace(/\s+/g, " ");
    if (p.length < C.pseudo.min) return { ok: false, error: `Au moins ${C.pseudo.min} caractères.` };
    if (p.length > C.pseudo.max) return { ok: false, error: `${C.pseudo.max} caractères maximum.` };
    if (!/^[\p{L}\p{N} _.\-]+$/u.test(p)) return { ok: false, error: "Lettres, chiffres, espaces, . _ - uniquement." };
    return { ok: true, pseudo: p };
  }
  function createAccount(p) {
    if (hasAccount()) return false;           // le pseudo est définitif
    const v = checkPseudo(p);
    if (!v.ok) return false;
    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    state.account = { id, pseudo: v.pseudo, createdAt: Date.now() };
    state.createdAt = state.account.createdAt;
    save();
    return true;
  }

  /* ---------- Collection ---------- */
  function levels(id) { return state.collection[id] || {}; }
  function copies(id) { return Object.values(levels(id)).reduce((a, b) => a + b, 0); }
  function owned(id) { return copies(id) > 0; }
  function bestLevel(id) {
    const lv = Object.keys(levels(id)).filter((k) => levels(id)[k] > 0).map(Number);
    return lv.length ? Math.max(...lv) : 1;
  }
  function addCopy(id, level = 1, n = 1) {
    const l = (state.collection[id] = state.collection[id] || {});
    l[level] = (l[level] || 0) + n;
    if (l[level] <= 0) delete l[level];
    if (!Object.keys(l).length) delete state.collection[id];
  }
  function uniqueOwned() { return CARDS.filter((c) => owned(c.id)).length; }
  function totalCopies() { return CARDS.reduce((s, c) => s + copies(c.id), 0); }

  function statsAt(c, level = 1) {
    if (c.attaque == null && c.defense == null) return null;
    const m = 1 + C.fusion.bonusParEtoile * starsOf(level);
    return { atk: Math.round((c.attaque || 0) * m), def: Math.round((c.defense || 0) * m) };
  }

  /* ---------- Raretés & tirages ---------- */
  // Seules les raretés qui ont au moins une carte peuvent sortir.
  function availableRarities() { return C.raretes.filter((r) => CARDS.some((c) => c.rarete === r.id)); }

  function dropRates() {
    const av = availableRarities();
    const total = av.reduce((s, r) => s + r.poids, 0);
    const out = {};
    av.forEach((r) => (out[r.id] = (r.poids / total) * 100));
    return out;
  }

  function rollRarity(minId) {
    const av = availableRarities();
    let pool = minId ? av.filter((r) => rarityIndex(r.id) >= rarityIndex(minId)) : av;
    if (!pool.length) pool = av;
    const total = pool.reduce((s, r) => s + r.poids, 0);
    let x = Math.random() * total;
    for (const r of pool) { if ((x -= r.poids) < 0) return r; }
    return pool[pool.length - 1];
  }

  /* ---------- Boosters ---------- */
  // Recharge : +1 booster toutes les X minutes, jusqu'au maximum.
  function refill() {
    const b = state.boosters, now = Date.now(), iv = INTERVAL(), cap = CAP();
    if (b.stock >= cap) { b.stock = cap; b.last = now; return; }
    const gained = Math.floor((now - b.last) / iv);
    if (gained > 0) {
      b.stock = Math.min(cap, b.stock + gained);
      b.last = b.stock >= cap ? now : b.last + gained * iv;
      save();
    }
  }
  function boostersLeft() {
    if (C.modeTest) return Infinity;
    refill();
    return state.boosters.stock;
  }
  function msUntilNext() {
    if (C.modeTest) return 0;
    refill();
    const b = state.boosters;
    return b.stock >= CAP() ? 0 : Math.max(0, INTERVAL() - (Date.now() - b.last));
  }

  function openBooster() {
    if (boostersLeft() <= 0 || !CARDS.length) return null;
    if (!C.modeTest) {
      if (state.boosters.stock >= CAP()) state.boosters.last = Date.now(); // la recharge démarre
      state.boosters.stock--;
    }
    const n = C.cartesParBooster;
    const pulled = [];
    for (let i = 0; i < n; i++) {
      const min = i === n - 1 ? C.garantieDerniereCarte : null;
      const r = rollRarity(min);
      pulled.push(pick(CARDS.filter((c) => c.rarete === r.id)));
    }
    // Les plus rares à la fin, pour le suspense
    pulled.sort((a, b) => rarityIndex(a.rarete) - rarityIndex(b.rarete));
    const results = pulled.map((c) => {
      const isNew = !owned(c.id);
      addCopy(c.id, 1);
      return { card: c, isNew };
    });
    state.stats.boosters++;
    state.stats.cartes += n;
    save();
    return results;
  }

  // Booster ouvert par le serveur : { cards: [ids], collection, bstock, blast }
  function applyServerBooster(r) {
    const results = (r.cards || []).map((id) => {
      const c = card(id);
      if (!c) return null;
      const isNew = !owned(id);
      addCopy(id, 1);
      return { card: c, isNew };
    }).filter(Boolean);
    setServerBoosters(r);
    state.stats.boosters++;
    state.stats.cartes += results.length;
    setCollection(r.collection);
    return results.length ? results : null;
  }
  // Stock de boosters compté par le serveur (même calcul de recharge que dans le jeu)
  function setServerBoosters(row) {
    if (row && row.bstock != null) {
      const last = Date.parse(row.blast);
      state.boosters = { stock: row.bstock, last: isNaN(last) ? Date.now() : last };
    }
  }

  /* ---------- Synchronisation avec le serveur ---------- */
  // Remplace la collection par celle du serveur, puis ré-applique les cartes pas encore envoyées.
  function setCollection(serverColl) {
    const c = JSON.parse(JSON.stringify(serverColl || {}));
    state.collection = {};
    Object.keys(c).forEach((id) => Object.keys(c[id] || {}).forEach((l) => { if (c[id][l] > 0) addCopy(id, +l, c[id][l]); }));
    state.pending.forEach((p) => addCopy(p.card, p.level, 1));
    save();
  }
  function applyPlayer(row) {
    state.account = { id: row.id, pseudo: row.pseudo, createdAt: Date.parse(row.created_at) || Date.now(), online: true };
    state.createdAt = state.account.createdAt;
    state.vitrine = Array.isArray(row.vitrine) ? row.vitrine : [];
    state.pending = []; // les cartes viennent maintenant toutes du serveur
    setServerBoosters(row);
    setCollection(row.collection);
  }
  function clearAccount() {
    state.account = null; state.collection = {}; state.pending = []; state.vitrine = [];
    save();
  }
  function takePending(n) { return state.pending.slice(0, n); }
  function dropPending(batch) {
    const ks = new Set(batch.map((p) => p.k));
    state.pending = state.pending.filter((p) => !ks.has(p.k));
    save();
  }

  /* ---------- Vitrine ---------- */
  function setVitrine(ids) {
    state.vitrine = ids.filter((id) => card(id) && owned(id)).slice(0, C.vitrineMax || 4);
    save();
    return state.vitrine;
  }
  function vitrine() { return (state.vitrine || []).filter((id) => card(id) && owned(id)); }

  /* ---------- Fusion ---------- */
  function canFuse(id, level) {
    return level < MAX_LEVEL() && (levels(id)[level] || 0) >= 2;
  }
  function fuse(id, level) {
    level = Number(level);
    if (!canFuse(id, level)) return false;
    addCopy(id, level, -2);
    addCopy(id, level + 1, 1);
    state.stats.fusions++;
    save();
    return true;
  }
  function fusables() {
    const out = [];
    CARDS.forEach((c) => {
      Object.keys(levels(c.id)).map(Number).sort((a, b) => a - b).forEach((lv) => {
        if (canFuse(c.id, lv)) out.push({ card: c, level: lv, count: levels(c.id)[lv] });
      });
    });
    return out;
  }

  /* ---------- Image provisoire ---------- */
  const phCache = {};
  function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
  function placeholder(c) {
    if (!c) return "";
    if (phCache[c.id]) return phCache[c.id];
    const emoji = c.emoji || C.emojiParDefaut || "🧑";
    // Illustration provisoire : l'emoji seul, sur fond transparent (le verre teinté de la carte se voit derrière)
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 360'>` +
      `<defs><radialGradient id='r'><stop offset='0' stop-color='rgba(255,255,255,.28)'/><stop offset='1' stop-color='rgba(255,255,255,0)'/></radialGradient></defs>` +
      `<circle cx='150' cy='175' r='130' fill='url(#r)'/>` +
      `<text x='150' y='228' font-size='150' text-anchor='middle'>${emoji}</text>` +
      `</svg>`;
    return (phCache[c.id] = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  }


  return {
    load, save, reset, validate,
    hasAccount, checkPseudo, createAccount, starsOf, maxLevel: MAX_LEVEL,
    setCollection, applyPlayer, clearAccount, takePending, dropPending, setVitrine, vitrine,
    unlimited: () => CAP() === Infinity,
    card, rarity, rarityIndex, availableRarities, dropRates,
    copies, owned, levels, bestLevel, uniqueOwned, totalCopies, statsAt,
    boostersLeft, openBooster, applyServerBooster, msUntilNext,
    canFuse, fuse, fusables,
    placeholder,
    get state() { return state; }
  };
})();
