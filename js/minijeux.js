/* =========================================================
   ONGLET « MINI-JEUX »
   - Accueil : choix du mini-jeu (Qui est-ce ?, Memory)
   - Memory solo : 5 niveaux de plus en plus durs, coups limités.
     Après chaque niveau réussi : s'arrêter (récompense) ou continuer.
   - Memory 1 contre 1 : on choisit la grille, on invite un ami,
     chacun son tour ; une paire trouvée = on rejoue.
     La position des cartes reste sur le serveur (supabase/memory.sql).
   ========================================================= */
(function () {
  const G = BM.Game;
  const O = BM.Online;
  const { $, $$, esc, cardHTML, toast } = BM.UI;
  const app = () => BM.UI.app;
  const card = (id) => G.card(id) || { id, nom: "?", rarete: "commune", image: "" };
  const initial = (p) => esc((p || "?").trim().charAt(0).toUpperCase());
  const LOGO = () => ($("[data-logo]") ? $("[data-logo]").innerHTML : "");

  /* ---------- Les niveaux (solo) et les grilles (1v1) ----------
     coups = nombre d'essais (2 cartes retournées = 1 coup), réussis ou ratés */
  const LEVELS = [
    { cols: 4, rows: 3, pairs: 6,  coups: 16 },
    { cols: 4, rows: 4, pairs: 8,  coups: 18 },
    { cols: 5, rows: 4, pairs: 10, coups: 20 },
    { cols: 6, rows: 5, pairs: 15, coups: 28 },
    { cols: 6, rows: 6, pairs: 18, coups: 32 }
  ];
  const DIFF = ["Facile", "Moyen", "Difficile", "Très dur", "Infernal"];
  const gridOf = (pairs) => LEVELS.find((l) => l.pairs === pairs) || LEVELS[0];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let poll = null;
  const stopPoll = () => { clearInterval(poll); poll = null; };
  window.addEventListener("hashchange", () => stopPoll());

  function tileHTML(i, cardId, cls) {
    return `<button class="mm-tile ${cls}" data-i="${i}" aria-label="Carte ${i + 1}">
      <span class="mm-inner">
        <span class="mm-face mm-back"><span class="card-back"><span class="cb-logo">${LOGO()}</span></span></span>
        <span class="mm-face mm-front">${cardId ? cardHTML(card(cardId), {}) : ""}</span>
      </span></button>`;
  }
  const boardStyle = (l) => `--cols:${l.cols};--rows:${l.rows}`;

  /* =========================================================
     ACCUEIL DES MINI-JEUX
     ========================================================= */
  function renderHub() {
    const qw = O.qe ? O.qe.waiting : 0, mw = O.mm ? O.mm.waiting : 0;
    app().innerHTML = `
    <section class="mj-hub">
      <h1 class="page-title">Mini-jeux</h1>
      <p class="muted">Joue avec les cartes du jeu, seul ou contre tes amis.</p>
      <div class="mj-games">
        <a class="mj-game mj-qe" href="#quiestce">
          <span class="mj-ico">❓</span>
          <span class="mj-txt"><b>Qui est-ce ?</b><span>1 contre 1 avec un ami, en vocal. Devine sa carte avant qu'il trouve la tienne.</span></span>
          ${qw ? `<i class="nav-badge">${qw}</i>` : ""}
        </a>
        <a class="mj-game mj-mm" href="#memory">
          <span class="mj-ico">🧠</span>
          <span class="mj-txt"><b>Memory</b><span>Retrouve les paires. En solo sur 5 niveaux, ou en 1 contre 1.</span></span>
          ${mw ? `<i class="nav-badge">${mw}</i>` : ""}
        </a>
      </div>
    </section>`;
    if (O.isOn && O.isOn()) Promise.all([O.qe.list(), O.mm.list()]).then(() => { if (BM.UI.currentPage === "minijeux") { BM.UI.updateChrome(); } }).catch(() => {});
  }

  /* =========================================================
     MEMORY : choix du mode
     ========================================================= */
  function renderMemoryHome() {
    app().innerHTML = `
    <section class="mj-hub">
      <div class="qe-head"><a class="btn btn-sm" href="#minijeux">‹ Mini-jeux</a><h1 class="page-title">Memory</h1></div>
      <p class="muted">Retourne 2 cartes : si ce sont les mêmes, elles restent découvertes. Sinon, elles se retournent.</p>
      <div class="mj-games">
        <a class="mj-game" href="#memory-solo">
          <span class="mj-ico">🎯</span>
          <span class="mj-txt"><b>Solo</b><span>5 niveaux, de 12 à 36 cartes, avec un nombre de coups limité. Arrête-toi quand tu veux pour garder ta récompense.</span></span>
        </a>
        <a class="mj-game" href="#memory-multi">
          <span class="mj-ico">⚔️</span>
          <span class="mj-txt"><b>1 contre 1</b><span>Choisis la grille et défie un ami. Chacun son tour : une paire trouvée, tu rejoues. Le plus de paires gagne.</span></span>
          ${O.mm && O.mm.waiting ? `<i class="nav-badge">${O.mm.waiting}</i>` : ""}
        </a>
      </div>
    </section>`;
  }

  /* =========================================================
     MEMORY SOLO
     ========================================================= */
  let solo = null; // { lv, deck, open:[], matched:Set, coups, errors, lock, started }

  function renderSolo() {
    if (!solo) return drawSoloStart();
    drawSolo();
  }

  function drawSoloStart() {
    app().innerHTML = `
    <section class="mm-solo">
      <div class="qe-head"><a class="btn btn-sm" href="#memory">‹ Memory</a><h1 class="page-title">Memory solo</h1></div>
      <div class="panel">
        <h2>5 niveaux</h2>
        <p class="muted">Chaque niveau réussi te débloque une récompense plus grosse. Après chaque niveau, tu choisis : <b>t'arrêter</b> et garder ta récompense, ou <b>continuer</b>… mais si tu échoues, tu perds tout.</p>
        <div class="mm-levels">${LEVELS.map((l, i) => `
          <div class="mm-level"><b>Niveau ${i + 1}</b><span>${l.cols}×${l.rows} · ${l.pairs * 2} cartes</span><span>${l.coups} coups</span><em class="d${i}">${DIFF[i]}</em></div>`).join("")}</div>
        <p class="muted small">Un coup = 2 cartes retournées, que la paire soit bonne ou non. Récompenses : bientôt !</p>
        <button class="btn btn-primary btn-wide" id="mmStart">▶ Commencer le niveau 1</button>
      </div>
    </section>`;
    $("#mmStart").addEventListener("click", () => startLevel(0));
  }

  function startLevel(lv) {
    const L = LEVELS[lv];
    const ids = shuffle(BM.CARDS.map((c) => c.id)).slice(0, L.pairs);
    solo = { lv, deck: shuffle([...ids, ...ids]), open: [], matched: new Set(), coups: 0, errors: 0, lock: false };
    drawSolo();
  }

  function drawSolo() {
    const L = LEVELS[solo.lv];
    const left = L.coups - solo.coups;
    app().innerHTML = `
    <section class="mm-play">
      <div class="qe-head"><a class="btn btn-sm" href="#memory">‹ Memory</a><h1 class="page-title">Niveau ${solo.lv + 1} <span class="muted">· ${DIFF[solo.lv]}</span></h1></div>
      <div class="mm-hud">
        <span class="mm-stat"><span>Paires</span><b>${solo.matched.size / 2} / ${L.pairs}</b></span>
        <span class="mm-stat ${left <= 3 ? "warn" : ""}"><span>Coups restants</span><b id="mmLeft">${left}</b></span>
        <span class="mm-stat"><span>Erreurs</span><b>${solo.errors}</b></span>
        <span class="mm-steps">${LEVELS.map((_, i) => `<i class="${i < solo.lv ? "ok" : i === solo.lv ? "now" : ""}">${i + 1}</i>`).join("")}</span>
      </div>
      <div class="mm-board" style="${boardStyle(L)}">${solo.deck.map((id, i) =>
        tileHTML(i, id, (solo.matched.has(i) ? "flipped matched" : "") + (solo.open.includes(i) ? " flipped" : ""))).join("")}</div>
    </section>`;
    $$(".mm-board .mm-tile").forEach((b) => b.addEventListener("click", () => soloFlip(+b.dataset.i)));
  }

  function soloFlip(i) {
    if (!solo || solo.lock || solo.matched.has(i) || solo.open.includes(i)) return;
    solo.open.push(i);
    $(`.mm-tile[data-i="${i}"]`).classList.add("flipped");
    if (solo.open.length < 2) return;
    const [a, b] = solo.open;
    solo.coups++;
    const L = LEVELS[solo.lv];
    if (solo.deck[a] === solo.deck[b]) {
      solo.matched.add(a); solo.matched.add(b); solo.open = [];
      setTimeout(() => { $$(`.mm-tile[data-i="${a}"], .mm-tile[data-i="${b}"]`).forEach((t) => t.classList.add("matched")); }, 350);
      if (solo.matched.size === solo.deck.length) return setTimeout(() => { drawSolo(); levelWon(); }, 700);
    } else {
      solo.errors++;
      solo.lock = true;
      setTimeout(() => {
        $$(`.mm-tile[data-i="${a}"], .mm-tile[data-i="${b}"]`).forEach((t) => t.classList.remove("flipped"));
        solo.open = []; solo.lock = false;
        if (solo.coups >= L.coups) { drawSolo(); levelLost(); }
      }, 900);
    }
    const left = L.coups - solo.coups;
    const el = $("#mmLeft"); if (el) { el.textContent = left; el.parentElement.classList.toggle("warn", left <= 3); }
    const p = $(".mm-stat b"); if (p) p.textContent = `${solo.matched.size / 2} / ${L.pairs}`;
    const e = $$(".mm-stat b")[2]; if (e) e.textContent = solo.errors;
    if (solo.coups >= L.coups && solo.matched.size < solo.deck.length && solo.deck[a] === solo.deck[b]) { solo.lock = true; setTimeout(() => { drawSolo(); levelLost(); }, 700); }
  }

  function levelWon() {
    const lv = solo.lv, last = lv === LEVELS.length - 1, L = LEVELS[lv];
    BM.UI.openModal(`
      <div class="confirm mm-result win">
        <div class="mm-big">🏆</div>
        <h2>${last ? "Memory terminé !" : `Niveau ${lv + 1} réussi !`}</h2>
        <p class="muted">${L.pairs} paires en ${solo.coups} coups (${solo.errors} erreur${solo.errors > 1 ? "s" : ""}).</p>
        <div class="mm-reward">🎁 Récompense du niveau ${lv + 1} : <b>bientôt disponible</b></div>
        ${last ? `<p>Tu as réussi les 5 niveaux. Respect.</p>` : `<p>Tu t'arrêtes et tu gardes ta récompense, ou tu tentes le niveau ${lv + 2} (${LEVELS[lv + 1].pairs * 2} cartes, ${LEVELS[lv + 1].coups} coups) ? Si tu échoues, tu perds tout.</p>`}
        <div class="pull-actions">
          <button class="btn" data-stop>🏁 ${last ? "Terminer" : "M'arrêter là"}</button>
          ${last ? "" : `<button class="btn btn-primary" data-next>▶ Niveau ${lv + 2}</button>`}
        </div>
      </div>`);
    $("#modalContent [data-stop]").addEventListener("click", () => {
      BM.UI.closeModal();
      toast(`Tu t'arrêtes au niveau ${lv + 1}. Bien joué !`);
      solo = null; drawSoloStart();
    });
    const nx = $("#modalContent [data-next]");
    if (nx) nx.addEventListener("click", () => { BM.UI.closeModal(); startLevel(lv + 1); });
  }

  function levelLost() {
    const lv = solo.lv;
    BM.UI.openModal(`
      <div class="confirm mm-result lose">
        <div class="mm-big">💥</div>
        <h2>Plus de coups !</h2>
        <p class="muted">Niveau ${lv + 1} raté : ${solo.matched.size / 2} paire${solo.matched.size > 2 ? "s" : ""} sur ${LEVELS[lv].pairs}.${lv > 0 ? " Tu perds les récompenses de la série." : ""}</p>
        <div class="pull-actions"><button class="btn" data-back>Retour</button><button class="btn btn-primary" data-again>🔁 Recommencer au niveau 1</button></div>
      </div>`);
    $("#modalContent [data-back]").addEventListener("click", () => { BM.UI.closeModal(); solo = null; drawSoloStart(); });
    $("#modalContent [data-again]").addEventListener("click", () => { BM.UI.closeModal(); startLevel(0); });
  }

  /* =========================================================
     MEMORY 1 CONTRE 1 : accueil (grille + invitations)
     ========================================================= */
  let pickPairs = 6;

  function offline(title) {
    if (O.isOn && O.isOn()) return false;
    app().innerHTML = `<section><div class="qe-head"><a class="btn btn-sm" href="#memory">‹ Memory</a><h1 class="page-title">${title}</h1></div>
      <div class="empty">${O.configured() ? "Impossible de joindre le serveur pour l'instant." : "Le mode 1 contre 1 a besoin du serveur."}</div></section>`;
    return true;
  }

  async function renderMulti() {
    stopPoll();
    if (offline("Memory 1 contre 1")) return;
    app().innerHTML = `<section><h1 class="page-title">Memory 1 contre 1</h1><div class="empty loading-box"><span class="spinner"></span> Chargement…</div></section>`;
    let games, soc;
    try { [games, soc] = await Promise.all([O.mm.list(), O.social()]); }
    catch (e) { app().innerHTML = `<section><h1 class="page-title">Memory 1 contre 1</h1><div class="empty">${esc(e.message)}</div></section>`; return; }
    if (BM.UI.currentPage !== "memory-multi") return;
    drawMulti(games, soc.friends);
    BM.UI.updateChrome();
    let sig = JSON.stringify(games.map((g) => [g.id, g.status, g.my_turn]));
    poll = setInterval(async () => {
      if (document.hidden || BM.UI.currentPage !== "memory-multi") return;
      try {
        const g2 = await O.mm.list();
        const s2 = JSON.stringify(g2.map((g) => [g.id, g.status, g.my_turn]));
        if (s2 !== sig) { sig = s2; drawMulti(g2, soc.friends); BM.UI.updateChrome(); }
      } catch (e) {}
    }, 4000);
  }

  const gridLabel = (pairs) => { const l = gridOf(pairs); return `${l.cols}×${l.rows} · ${pairs * 2} cartes`; };
  function mmStatus(g) {
    const o = esc(g.opponent.pseudo || "?");
    if (g.status === "invite") return g.role === "guest" ? `<b>${o}</b> t'invite (${gridLabel(g.pairs)})` : `En attente de <b>${o}</b> (${gridLabel(g.pairs)})`;
    if (g.status === "play") return `${g.my_turn ? "<b>À toi de jouer</b>" : `Tour de <b>${o}</b>`} · ${g.my_score} – ${g.opp_score}`;
    if (g.status === "done") return g.winner === "me" ? `Victoire contre <b>${o}</b> (${g.my_score} – ${g.opp_score}) 🏆` : g.winner === "tie" ? `Égalité avec <b>${o}</b>` : `Défaite contre <b>${o}</b> (${g.my_score} – ${g.opp_score})`;
    if (g.status === "declined") return `${o} a refusé`;
    return `Partie annulée avec ${o}`;
  }

  function drawMulti(games, friends) {
    const invites = games.filter((g) => g.status === "invite" && g.role === "guest");
    const running = games.filter((g) => g.status === "play" || (g.status === "invite" && g.role === "host"));
    const past = games.filter((g) => ["done", "declined", "cancelled"].includes(g.status)).slice(0, 6);
    const busyWith = new Set(games.filter((g) => ["invite", "play"].includes(g.status)).map((g) => g.opponent.id));
    app().innerHTML = `
    <section class="qe-lobby">
      <div class="qe-head"><a class="btn btn-sm" href="#memory">‹ Memory</a><h1 class="page-title">Memory 1 contre 1</h1></div>
      ${invites.length ? `<div class="panel hl"><h2>Invitations reçues <span class="count-pill">${invites.length}</span></h2><div class="qe-list">${invites.map((g) => `
        <div class="qe-row"><span class="av">${initial(g.opponent.pseudo)}</span><span class="qe-row-txt">${mmStatus(g)}</span>
          <button class="btn btn-sm" data-decline="${g.id}">Refuser</button><button class="btn btn-primary btn-sm" data-accept="${g.id}">✓ Jouer</button></div>`).join("")}</div></div>` : ""}
      ${running.length ? `<div class="panel"><h2>Parties en cours</h2><div class="qe-list">${running.map((g) => `
        <div class="qe-row ${g.my_turn ? "is-hot" : ""}"><span class="av">${initial(g.opponent.pseudo)}</span><span class="qe-row-txt">${mmStatus(g)}</span>
          ${g.status === "invite" ? `<button class="btn btn-sm" data-cancel="${g.id}">Annuler</button>` : `<a class="btn btn-primary btn-sm" href="#mm-${g.id}">Reprendre</a>`}</div>`).join("")}</div></div>` : ""}
      <div class="panel">
        <h2>1. Choisis la grille</h2>
        <div class="mm-sizes">${LEVELS.map((l, i) => `<button class="mm-size ${l.pairs === pickPairs ? "on" : ""}" data-pairs="${l.pairs}"><b>${l.cols}×${l.rows}</b><span>${l.pairs * 2} cartes</span><em class="d${i}">${DIFF[i]}</em></button>`).join("")}</div>
        <h2 style="margin-top:18px">2. Défie un ami</h2>
        ${friends.length ? `<div class="qe-list">${friends.map((p) => `
          <div class="qe-row"><span class="av">${initial(p.pseudo)}</span><span class="qe-row-txt"><b>${esc(p.pseudo)}</b></span>
            ${busyWith.has(p.id) ? `<span class="muted small">partie en cours</span>` : `<button class="btn btn-primary btn-sm" data-invite="${p.id}">⚔️ Défier</button>`}</div>`).join("")}</div>`
          : `<p class="muted">Ajoute d'abord des amis dans l'onglet <a href="#social">Social</a>.</p>`}
        <p class="muted small">Récompenses selon la grille : bientôt !</p>
      </div>
      ${past.length ? `<div class="panel"><h2>Dernières parties</h2><div class="qe-list">${past.map((g) => `
        <div class="qe-row is-past"><span class="av">${initial(g.opponent.pseudo)}</span><span class="qe-row-txt">${mmStatus(g)}</span></div>`).join("")}</div></div>` : ""}
    </section>`;
    let busy = false;
    const act = async (btn, fn, after) => {
      if (busy) return; busy = true; btn.disabled = true;
      try { const r = await fn(); after && after(r); } catch (e) { toast(esc(e.message), "bad"); btn.disabled = false; }
      busy = false;
    };
    $$("[data-pairs]").forEach((b) => b.addEventListener("click", () => { pickPairs = +b.dataset.pairs; $$("[data-pairs]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $$("[data-invite]").forEach((b) => b.addEventListener("click", () => act(b, () => O.mm.invite(b.dataset.invite, pickPairs), (g) => { toast(`Invitation envoyée à <b>${esc(g.opponent.pseudo)}</b> !`); location.hash = "#mm-" + g.id; })));
    $$("[data-accept]").forEach((b) => b.addEventListener("click", () => act(b, () => O.mm.respond(b.dataset.accept, true), (g) => { location.hash = "#mm-" + g.id; })));
    $$("[data-decline]").forEach((b) => b.addEventListener("click", () => act(b, () => O.mm.respond(b.dataset.decline, false), () => renderMulti())));
    $$("[data-cancel]").forEach((b) => b.addEventListener("click", () => act(b, () => O.mm.quit(b.dataset.cancel), () => renderMulti())));
  }

  /* =========================================================
     MEMORY 1 CONTRE 1 : la partie
     ========================================================= */
  let mg = null;          // état de la partie (vu par moi)
  let shownSeq = 0;       // dernière paire déjà montrée
  let reveal = null;      // { i, j, ci, cj, until } : paire ratée montrée un instant
  let flipping = false;

  async function renderMM(id) {
    stopPoll();
    if (offline("Memory 1 contre 1")) return;
    if (!mg || mg.id !== id) { mg = null; reveal = null; app().innerHTML = `<section><h1 class="page-title">Memory</h1><div class="empty loading-box"><span class="spinner"></span> Chargement…</div></section>`; }
    try { const g = await O.mm.state(id); if (!mg || mg.id !== id) shownSeq = g.last_pair ? g.last_pair.seq : 0; mg = g; }
    catch (e) { app().innerHTML = `<section><div class="empty">${esc(e.message)}<br><br><a class="btn" href="#memory-multi">Retour</a></div></section>`; return; }
    drawMM();
    poll = setInterval(async () => {
      if (document.hidden || flipping || BM.UI.currentPage !== "mm-" + id) return;
      try {
        const g = await O.mm.state(id);
        if (BM.UI.currentPage !== "mm-" + id || flipping) return;
        const changed = g.seq !== mg.seq || g.status !== mg.status;
        const wasMine = mg.my_turn;
        apply(g);
        if (changed) { drawMM(); if (!wasMine && g.my_turn && g.status === "play") toast("À toi de jouer !"); BM.UI.updateChrome(); }
      } catch (e) {}
    }, 1000);
  }

  // Nouvelle donnée du serveur : si une paire ratée vient d'être jouée, on la montre 1,4 s
  function apply(g) {
    const lp = g.last_pair;
    if (lp && lp.seq > shownSeq) {
      shownSeq = lp.seq;
      if (!lp.match) {
        reveal = { i: lp.i, j: lp.j, ci: lp.ci, cj: lp.cj, until: Date.now() + 1400 };
        setTimeout(() => { if (reveal && Date.now() >= reveal.until - 20) { reveal = null; if (mg && BM.UI.currentPage === "mm-" + mg.id) drawMM(); } }, 1420);
      }
    }
    mg = g;
  }

  function drawMM() {
    const g = mg, L = gridOf(g.pairs), o = esc(g.opponent.pseudo || "?");
    const n = g.pairs * 2;
    const faces = {};
    Object.entries(g.matched || {}).forEach(([k, v]) => (faces[k] = { card: v.card, cls: "flipped matched " + (v.by === "me" ? "by-me" : "by-opp") }));
    if (g.pending) faces[g.pending.i] = { card: g.pending.card, cls: "flipped" };
    if (reveal) { faces[reveal.i] = { card: reveal.ci, cls: "flipped miss" }; faces[reveal.j] = { card: reveal.cj, cls: "flipped miss" }; }
    const lp = g.last_pair;
    let banner;
    if (g.status === "invite") banner = g.role === "host"
      ? `<div class="qe-banner wait">⏳ Invitation envoyée à <b>${o}</b> (${gridLabel(g.pairs)}).</div>`
      : `<div class="qe-banner hot"><b>${o}</b> t'invite (${gridLabel(g.pairs)}). <button class="btn btn-sm" data-decline>Refuser</button> <button class="btn btn-primary btn-sm" data-accept>✓ Jouer</button></div>`;
    else if (g.status === "done") banner = g.last_event && g.last_event.type === "abandon"
      ? `<div class="qe-banner ${g.winner === "me" ? "win" : "lose"}">${g.winner === "me" ? `<b>${o}</b> a abandonné : tu gagnes ! 🏆` : "Tu as abandonné."}</div>`
      : `<div class="qe-banner ${g.winner === "me" ? "win" : g.winner === "tie" ? "wait" : "lose"}">${g.winner === "me" ? "🏆 <b>Gagné !</b>" : g.winner === "tie" ? "🤝 <b>Égalité !</b>" : "😵 <b>Perdu…</b>"} ${g.my_score} paire${g.my_score > 1 ? "s" : ""} contre ${g.opp_score}. <span class="muted">Récompense : bientôt</span></div>`;
    else {
      const info = lp && lp.seq === g.seq ? (lp.match ? (lp.by === "me" ? " Paire trouvée, tu rejoues !" : ` ${o} a trouvé une paire et rejoue.`) : (lp.by === "me" ? " Raté !" : ` ${o} s'est trompé.`)) : "";
      banner = g.my_turn
        ? `<div class="qe-banner hot">🎯 <b>À toi de jouer</b> : retourne 2 cartes.${info}</div>`
        : `<div class="qe-banner wait">⏳ Tour de <b>${o}</b>…${info}</div>`;
    }
    app().innerHTML = `
    <section class="mm-play ${g.my_turn && !reveal ? "is-my-turn" : ""}">
      <div class="qe-head"><a class="btn btn-sm" href="#memory-multi">‹ Parties</a><h1 class="page-title">Memory <span class="muted">vs ${o}</span></h1></div>
      ${banner}
      <div class="mm-hud">
        <span class="mm-stat me ${g.my_turn ? "turn" : ""}"><span>Toi</span><b>${g.my_score}</b></span>
        <span class="mm-stat opp ${g.status === "play" && !g.my_turn ? "turn" : ""}"><span>${o}</span><b>${g.opp_score}</b></span>
        <span class="mm-stat"><span>Restantes</span><b>${g.pairs - g.my_score - g.opp_score}</b></span>
        ${g.status === "play" || (g.status === "invite" && g.role === "host") ? `<button class="btn btn-sm qe-quit" id="mmQuit">${g.status === "invite" ? "Annuler" : "Abandonner"}</button>` : ""}
        ${g.status === "done" ? `<button class="btn btn-primary btn-sm" id="mmAgain">🔁 Rejouer</button>` : ""}
      </div>
      ${g.status === "invite" ? "" : `<div class="mm-board" style="${boardStyle(L)}">${Array.from({ length: n }, (_, i) => tileHTML(i, faces[i] && faces[i].card, faces[i] ? faces[i].cls : "")).join("")}</div>`}
    </section>`;
    $$(".mm-board .mm-tile").forEach((b) => b.addEventListener("click", () => mmFlip(+b.dataset.i)));
    const on = (s, f) => { const el = $(s); if (el) el.addEventListener("click", f); };
    on("#mmQuit", () => {
      BM.UI.openModal(`<div class="confirm"><p>${g.status === "invite" ? "Annuler l'invitation ?" : `Abandonner ? ${o} gagnera.`}</p><div class="pull-actions"><button class="btn" data-no>Non</button><button class="btn btn-primary" data-yes>Oui</button></div></div>`);
      $("#modalContent [data-no]").addEventListener("click", BM.UI.closeModal);
      $("#modalContent [data-yes]").addEventListener("click", async () => { BM.UI.closeModal(); try { apply(await O.mm.quit(g.id)); drawMM(); } catch (e) { toast(esc(e.message), "bad"); } });
    });
    on("#mmAgain", async () => { try { const r = await O.mm.invite(g.opponent.id, g.pairs); toast(`Invitation envoyée à <b>${esc(r.opponent.pseudo)}</b> !`); location.hash = "#mm-" + r.id; } catch (e) { toast(esc(e.message), "bad"); } });
    on("[data-accept]", async () => { try { apply(await O.mm.respond(g.id, true)); drawMM(); } catch (e) { toast(esc(e.message), "bad"); } });
    on("[data-decline]", async () => { try { await O.mm.respond(g.id, false); location.hash = "#memory-multi"; } catch (e) { toast(esc(e.message), "bad"); } });
  }

  async function mmFlip(i) {
    const g = mg;
    if (!g || g.status !== "play" || !g.my_turn || flipping || reveal) return;
    if ((g.matched || {})[i] || (g.pending && g.pending.i === i)) return;
    flipping = true;
    const tile = $(`.mm-tile[data-i="${i}"]`);
    if (tile) tile.classList.add("loading");
    try { apply(await O.mm.flip(g.id, i)); }
    catch (e) { toast(esc(e.message), "bad"); try { apply(await O.mm.state(g.id)); } catch (_) {} }
    flipping = false;
    drawMM();
    BM.UI.updateChrome();
  }

  BM.UI.page("minijeux", renderHub);
  BM.UI.page("memory", renderMemoryHome);
  BM.UI.page("memory-solo", renderSolo);
  BM.UI.page("memory-multi", renderMulti);
  BM.UI.prefixPage("mm-", renderMM);
})();
