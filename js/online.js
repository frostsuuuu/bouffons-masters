/* =========================================================
   MODE EN LIGNE (Supabase)
   ---------------------------------------------------------
   Seul fichier qui parle au serveur. Si js/supabase-config.js
   est vide, le jeu fonctionne hors ligne et l'onglet Social
   explique comment l'activer.
   ========================================================= */
window.BM = window.BM || {};

BM.Online = (function () {
  const cfg = BM.SUPABASE || {};
  const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  let sb = null, user = null, player = null;
  let status = "off"; // off | connecting | online | offline
  let incoming = 0;
  let flushing = null;

  const configured = () => !!(cfg.url && cfg.cle);

  /* ---------- Utilitaires ---------- */
  function timeout(p, ms = 12000) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(err("TIMEOUT")), ms))]);
  }
  const MESSAGES = {
    PSEUDO_PRIS: "Ce pseudo est déjà pris, choisis-en un autre.",
    PSEUDO_LONGUEUR: "Le pseudo doit faire entre 3 et 16 caractères.",
    PSEUDO_CARACTERES: "Lettres, chiffres, espaces, . _ - uniquement.",
    NON_CONNECTE: "Tu n'es pas connecté au serveur.",
    PAS_DE_COMPTE: "Compte introuvable sur le serveur.",
    CARTE_MANQUANTE: "Une des cartes n'est plus disponible (déjà échangée ou fusionnée).",
    ECHANGE_TERMINE: "Cet échange a déjà été traité.",
    ECHANGE_VIDE: "Choisis au moins une carte.",
    NON_AUTORISE: "Action non autorisée.",
    JOUEUR_INTROUVABLE: "Joueur introuvable.",
    TIMEOUT: "Le serveur ne répond pas. Vérifie ta connexion.",
    IDENTIFIANTS: "Pseudo ou mot de passe incorrect.",
    TROP_DE_TENTATIVES: "Trop d'essais ratés. Réessaie dans 15 minutes.",
    MDP_LONGUEUR: "Le mot de passe doit faire au moins 6 caractères.",
    MDP_ACTUEL: "Mot de passe actuel incorrect.",
    ANONYMOUS: "Les connexions anonymes sont désactivées dans Supabase (voir le guide).",
    LIB: "Impossible de charger la connexion au serveur."
  };
  function err(code, raw) {
    const e = new Error(MESSAGES[code] || raw || "Erreur du serveur.");
    e.code = code;
    return e;
  }
  function normalize(e) {
    if (e && e.code && MESSAGES[e.code]) return e;
    const m = String((e && (e.message || e.msg || e.error_description)) || e || "");
    if (/anonymous/i.test(m) && /disabled/i.test(m)) return err("ANONYMOUS");
    const key = Object.keys(MESSAGES).find((k) => m.includes(k));
    return key ? err(key) : err("AUTRE", m);
  }
  async function q(builder) {
    try {
      const { data, error } = await timeout(builder);
      if (error) throw error;
      return data;
    } catch (e) { throw normalize(e); }
  }
  function loadLib() {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement("script");
      s.src = LIB;
      s.onload = () => res();
      s.onerror = () => rej(err("LIB"));
      document.head.appendChild(s);
    });
  }

  /* ---------- Connexion ---------- */
  async function init() {
    if (!configured()) return (status = "off");
    status = "connecting";
    try {
      await timeout(loadLib());
      sb = sb || window.supabase.createClient(cfg.url, cfg.cle);
      const { data } = await timeout(sb.auth.getSession());
      user = data && data.session ? data.session.user : null;
      player = user ? await q(sb.rpc("my_player")) : null;
      status = "online";
    } catch (e) {
      console.warn("[Bouffons Masters] serveur injoignable :", e);
      status = "offline";
    }
    return status;
  }
  async function ready() {
    if (status !== "online") await init();
    if (status !== "online") throw err("TIMEOUT");
  }

  const myId = () => (player ? player.id : null);

  // Se connecter à un compte existant (pseudo + mot de passe) depuis ce navigateur
  async function login(pseudo, password) {
    await ensureUser();
    const res = await q(sb.rpc("login_player", { p_pseudo: pseudo, p_password: password }));
    if (!res || !res.ok) throw err((res && res.error) || "IDENTIFIANTS");
    player = res.player;
    return player;
  }

  // Choisir (compte sans mot de passe) ou changer son mot de passe
  async function setPassword(newPw, oldPw) {
    await ready();
    await q(sb.rpc("set_password", { p_new: newPw, p_old: oldPw || null }));
    if (player) player.has_password = true;
  }

  // Se déconnecter de ce navigateur (le compte reste intact sur le serveur)
  async function logout() {
    await ready();
    try { await q(sb.rpc("logout_device")); } catch (e) { /* on se déconnecte quand même */ }
    try { await sb.auth.signOut(); } catch (e) {}
    player = null; user = null; incoming = 0;
  }

  // Connexion anonyme (une par navigateur) : nécessaire avant toute lecture
  async function ensureUser() {
    await ready();
    if (user) return user;
    const res = await timeout(sb.auth.signInAnonymously()).catch((e) => ({ error: e }));
    if (res.error) throw normalize(res.error);
    return (user = res.data.user);
  }

  async function signup(pseudo, password) {
    await ensureUser();
    player = await q(sb.rpc("create_player", { p_pseudo: pseudo, p_password: password }));
    return player;
  }

  /* ---------- Ma collection ---------- */
  // Envoie les cartes de booster en attente (par paquets de 10)
  function flush() {
    if (!player || status !== "online") return Promise.resolve();
    if (flushing) return flushing;
    const run = (async () => {
      let batch;
      while ((batch = BM.Game.takePending(10)).length) {
        const coll = await q(sb.rpc("add_cards", { items: batch.map((p) => ({ card: p.card, level: p.level })) }));
        BM.Game.dropPending(batch);
        BM.Game.setCollection(coll);
      }
    })();
    flushing = run;
    const clear = () => { if (flushing === run) flushing = null; };
    run.then(clear, clear);
    return run;
  }

  async function fuse(card, level) {
    await ready();
    await flush();
    const coll = await q(sb.rpc("fuse_card", { p_card: card, p_level: level }));
    BM.Game.setCollection(coll);
    return coll;
  }

  async function setVitrine(ids) {
    if (!player) return;
    await q(sb.from("players").update({ vitrine: ids }).eq("id", player.id));
  }

  let statsTimer = null;
  function pushStats(stats) {
    if (!player || status !== "online") return;
    clearTimeout(statsTimer);
    statsTimer = setTimeout(() => {
      q(sb.from("players").update({ stats }).eq("id", player.id)).catch(() => {});
    }, 1500);
  }

  // Relit mon compte sur le serveur (collection modifiée par un échange, etc.)
  async function refresh() {
    if (!configured()) return false;
    if (status !== "online") { await init(); if (status !== "online") return false; }
    if (!user) return false;
    await flush().catch(() => {});
    const row = await q(sb.rpc("my_player"));
    if (!row) return false;
    player = row;
    BM.Game.applyPlayer(row);
    const t = await q(sb.from("trades").select("id").eq("to_id", row.id).eq("status", "pending"));
    incoming = (t || []).length;
    return true;
  }

  /* ---------- Joueurs & amis ---------- */
  const PUBLIC_COLS = "id,pseudo,collection,vitrine,stats,created_at";

  async function findByPseudo(pseudo) {
    await ensureUser();
    const clean = String(pseudo || "").trim().replace(/\s+/g, " ");
    if (!clean) return null;
    const pattern = clean.replace(/[\\%_]/g, (c) => "\\" + c);
    const rows = await q(sb.from("players").select("id,pseudo").ilike("pseudo", pattern).limit(5));
    return (rows || []).find((r) => r.pseudo.toLowerCase() === clean.toLowerCase()) || null;
  }
  async function getPlayer(id) {
    await ready();
    return q(sb.from("players").select(PUBLIC_COLS).eq("id", id).maybeSingle());
  }
  async function getPlayers(ids) {
    if (!ids.length) return [];
    return q(sb.from("players").select(PUBLIC_COLS).in("id", ids));
  }
  // { friends: [player], followers: [player qui m'ont ajouté mais pas moi] }
  async function social() {
    await ready();
    const rows = await q(sb.from("friendships").select("user_id,friend_id,created_at"));
    const mine = rows.filter((r) => r.user_id === myId()).map((r) => r.friend_id);
    const theirs = rows.filter((r) => r.friend_id === myId()).map((r) => r.user_id).filter((id) => !mine.includes(id));
    const players = await getPlayers([...new Set([...mine, ...theirs])]);
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    return {
      friends: mine.map((id) => byId[id]).filter(Boolean).sort((a, b) => a.pseudo.localeCompare(b.pseudo)),
      followers: theirs.map((id) => byId[id]).filter(Boolean)
    };
  }
  async function addFriend(id) {
    await ready();
    try { await q(sb.from("friendships").insert({ user_id: myId(), friend_id: id })); }
    catch (e) { if (!/duplicate|23505/i.test(e.message)) throw e; }
  }
  async function removeFriend(id) {
    await ready();
    await q(sb.from("friendships").delete().eq("user_id", myId()).eq("friend_id", id));
  }
  // Amis d'un joueur (ceux qu'il a ajoutés), visibles par tout le monde
  async function playerFriends(id) {
    await ready();
    return (await q(sb.rpc("player_friends", { p_player: id }))) || [];
  }
  async function myFriendIds() {
    await ready();
    const rows = await q(sb.from("friendships").select("friend_id").eq("user_id", myId()));
    return (rows || []).map((r) => r.friend_id);
  }
  async function isFriend(id) {
    await ready();
    const rows = await q(sb.from("friendships").select("friend_id").eq("user_id", myId()).eq("friend_id", id));
    return (rows || []).length > 0;
  }

  /* ---------- Échanges ---------- */
  async function trades() {
    await ready();
    const rows = await q(sb.from("trades").select("*").order("created_at", { ascending: false }).limit(60));
    const ids = [...new Set(rows.flatMap((t) => [t.from_id, t.to_id]))];
    const ps = ids.length ? await q(sb.from("players").select("id,pseudo").in("id", ids)) : [];
    const names = Object.fromEntries(ps.map((p) => [p.id, p.pseudo]));
    incoming = rows.filter((t) => t.to_id === myId() && t.status === "pending").length;
    return rows.map((t) => Object.assign({}, t, {
      mine: t.from_id === myId(),
      otherId: t.from_id === myId() ? t.to_id : t.from_id,
      otherPseudo: names[t.from_id === myId() ? t.to_id : t.from_id] || "?"
    }));
  }
  async function proposeTrade(toId, offer, request) {
    await ready();
    await flush();
    return q(sb.rpc("propose_trade", { p_to: toId, p_offer: offer, p_request: request }));
  }
  async function acceptTrade(id) {
    await ready();
    await flush();
    const coll = await q(sb.rpc("accept_trade", { p_trade: id }));
    BM.Game.setCollection(coll);
    incoming = Math.max(0, incoming - 1);
    return coll;
  }
  async function closeTrade(id) {
    await ready();
    await q(sb.rpc("close_trade", { p_trade: id }));
  }

  return {
    configured, init, ready, signup, flush, fuse, setVitrine, pushStats, refresh,
    findByPseudo, getPlayer, social, addFriend, removeFriend, isFriend, playerFriends, myFriendIds,
    trades, proposeTrade, acceptTrade, closeTrade,
    get status() { return status; },
    get player() { return player; },
    get me() { return myId(); },
    get hasPassword() { return !!(player && player.has_password); },
    login, setPassword, logout,
    get incoming() { return incoming; },
    isOn: () => status === "online" && !!player
  };
})();
