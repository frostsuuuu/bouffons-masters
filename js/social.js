/* =========================================================
   ONGLET SOCIAL : amis, profils des autres joueurs, échanges
   ========================================================= */
(function () {
  const C = BM.CONFIG;
  const G = BM.Game;
  const O = BM.Online;
  const { $, $$, esc, cardHTML, toast, stars } = BM.UI;
  let token = 0; // évite d'afficher une page chargée trop tard

  const app = () => BM.UI.app;
  const fmtDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const initial = (p) => esc((p || "?").trim().charAt(0).toUpperCase());

  // Liste "carte + niveau" d'une collection { id: { "1": n } }
  function entries(coll) {
    const out = [];
    BM.CARDS.slice()
      .sort((a, b) => G.rarityIndex(b.rarete) - G.rarityIndex(a.rarete) || a.nom.localeCompare(b.nom))
      .forEach((c) => {
        const lv = (coll || {})[c.id] || {};
        Object.keys(lv).map(Number).sort((a, b) => b - a).forEach((l) => { if (lv[l] > 0) out.push({ card: c, level: l, count: lv[l] }); });
      });
    return out;
  }
  const ownedCount = (coll) => BM.CARDS.filter((c) => Object.values((coll || {})[c.id] || {}).some((n) => n > 0)).length;
  const totalCount = (coll) => Object.values(coll || {}).reduce((s, lv) => s + Object.values(lv).reduce((a, b) => a + b, 0), 0);
  const bestLevelIn = (coll, id) => Math.max(1, ...Object.keys((coll || {})[id] || {}).filter((l) => coll[id][l] > 0).map(Number));

  function loading(title) {
    app().innerHTML = `<section><h1 class="page-title">${title}</h1><div class="empty loading-box"><span class="spinner"></span> Chargement…</div></section>`;
  }

  function offlineView() {
    if (!O.configured()) {
      app().innerHTML = `
      <section>
        <h1 class="page-title">Social</h1>
        <div class="panel">
          <h2>Le mode en ligne n'est pas encore activé</h2>
          <p class="muted">Pour ajouter des amis, voir leurs collections et faire des échanges, il faut brancher le jeu sur le serveur (Supabase).
          Suivez le guide <b>LISEZMOI.md</b>, partie « Mettre le jeu en ligne » : ça prend une dizaine de minutes.</p>
        </div>
      </section>`;
      return true;
    }
    if (!O.isOn()) {
      app().innerHTML = `
      <section>
        <h1 class="page-title">Social</h1>
        <div class="empty">Impossible de joindre le serveur pour l'instant.<br><br><button class="btn btn-primary" id="retry">Réessayer</button></div>
      </section>`;
      $("#retry").addEventListener("click", async () => { loading("Social"); await O.init(); if (O.player) G.applyPlayer(O.player); BM.UI.render(); });
      return true;
    }
    return false;
  }

  function errorView(title, e) {
    app().innerHTML = `<section><h1 class="page-title">${title}</h1><div class="empty">${esc(e.message || e)}<br><br><button class="btn btn-primary" id="retry">Réessayer</button></div></section>`;
    $("#retry").addEventListener("click", () => BM.UI.render());
  }

  /* ---------- Petites cartes dans les échanges ---------- */
  function miniList(items, emptyText) {
    if (!items.length) return `<p class="muted small">${emptyText}</p>`;
    // regroupe les doublons (même carte, même niveau)
    const groups = {};
    items.forEach((it) => { const k = it.card + "|" + it.level; groups[k] = groups[k] || { ...it, n: 0 }; groups[k].n++; });
    return `<div class="mini-cards">${Object.values(groups).map((g) => {
      const c = G.card(g.card);
      return c ? `<div class="mini">${cardHTML(c, { level: +g.level, count: g.n })}</div>` : `<div class="mini unknown">?</div>`;
    }).join("")}</div>`;
  }

  function tradeHTML(t, actions) {
    // Point de vue du joueur : ce que JE donne / ce que JE reçois
    const give = t.mine ? t.offer : t.request;
    const get = t.mine ? t.request : t.offer;
    const labels = { pending: "En attente", accepted: "Accepté ✓", declined: "Refusé", cancelled: "Annulé" };
    return `
      <div class="trade ${t.status}" data-trade="${t.id}">
        <div class="trade-head">
          <a href="#joueur-${t.otherId}" class="trade-who"><span class="av">${initial(t.otherPseudo)}</span><span>${t.mine ? "À" : "De"}&nbsp;<b>${esc(t.otherPseudo)}</b></span></a>
          <span class="muted small">${fmtDate(t.created_at)} · <span class="st st-${t.status}">${labels[t.status] || t.status}</span></span>
        </div>
        <div class="trade-body">
          <div><h4>Tu donnes</h4>${miniList(give, "Rien")}</div>
          <div class="trade-arrow">⇄</div>
          <div><h4>Tu reçois</h4>${miniList(get, "Rien")}</div>
        </div>
        ${actions ? `<div class="trade-actions">${actions}</div>` : ""}
      </div>`;
  }

  /* =========================================================
     PAGE SOCIAL
     ========================================================= */
  async function renderSocial() {
    if (offlineView()) return;
    const my = ++token;
    loading("Social");
    let data, trades;
    try { [data, trades] = await Promise.all([O.social(), O.trades()]); }
    catch (e) { if (my === token) errorView("Social", e); return; }
    if (my !== token) return;
    BM.UI.updateChrome();

    const incoming = trades.filter((t) => !t.mine && t.status === "pending");
    const outgoing = trades.filter((t) => t.mine && t.status === "pending");
    const history = trades.filter((t) => t.status !== "pending").slice(0, 8);
    const me = G.state.account || {};

    app().innerHTML = `
    <section class="social">
      <h1 class="page-title">Social</h1>

      <div class="panel add-friend">
        <h2>Ajouter un ami</h2>
        <form id="addForm" class="add-row" autocomplete="off">
          <input id="addInput" maxlength="${C.pseudo.max}" placeholder="Pseudo de ton ami" spellcheck="false" autocapitalize="off">
          <button class="btn btn-primary" type="submit">Ajouter</button>
        </form>
        <p class="muted small">Ton pseudo à donner à tes amis : <b class="my-pseudo">${esc(me.pseudo || "")}</b></p>
      </div>

      ${incoming.length ? `
      <div class="panel hl">
        <h2>Échanges reçus <span class="count-pill">${incoming.length}</span></h2>
        <div class="trades">${incoming.map((t) => tradeHTML(t, `
          <button class="btn btn-sm" data-decline="${t.id}">Refuser</button>
          <button class="btn btn-primary btn-sm" data-accept="${t.id}">✓ Accepter</button>`)).join("")}</div>
      </div>` : ""}

      <div class="panel">
        <h2>Mes amis <span class="count-pill">${data.friends.length}</span></h2>
        ${data.friends.length ? `<div class="friends">${data.friends.map((p) => friendRow(p, true)).join("")}</div>`
          : `<p class="muted">Pas encore d'amis. Ajoute-les avec leur pseudo !</p>`}
      </div>

      ${data.followers.length ? `
      <div class="panel">
        <h2>Ils t'ont ajouté</h2>
        <div class="friends">${data.followers.map((p) => friendRow(p, false)).join("")}</div>
      </div>` : ""}

      ${outgoing.length ? `
      <div class="panel">
        <h2>Propositions envoyées</h2>
        <div class="trades">${outgoing.map((t) => tradeHTML(t, `<button class="btn btn-sm" data-cancel="${t.id}">Annuler</button>`)).join("")}</div>
      </div>` : ""}

      ${history.length ? `
      <div class="panel">
        <h2>Historique</h2>
        <div class="trades small-trades">${history.map((t) => tradeHTML(t)).join("")}</div>
      </div>` : ""}
    </section>`;

    $("#addForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = $("#addInput").value.trim();
      if (!v) return;
      if (v.toLowerCase() === (me.pseudo || "").toLowerCase()) return toast("C'est ton propre pseudo 😄", "bad");
      const btn = $("#addForm button");
      btn.disabled = true;
      try {
        const p = await O.findByPseudo(v);
        if (!p) { toast(`Aucun joueur « ${esc(v)} »`, "bad"); btn.disabled = false; return; }
        await O.addFriend(p.id);
        toast(`<b>${esc(p.pseudo)}</b> ajouté à tes amis`);
        renderSocial();
      } catch (x) { toast(esc(x.message), "bad"); btn.disabled = false; }
    });
    $$("[data-add]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await O.addFriend(b.dataset.add); toast("Ami ajouté"); renderSocial(); } catch (x) { toast(esc(x.message), "bad"); b.disabled = false; }
    }));
    $$("[data-accept]").forEach((b) => b.addEventListener("click", () => act(b, () => O.acceptTrade(b.dataset.accept), "Échange réalisé ! Les cartes sont dans ta collection.")));
    $$("[data-decline]").forEach((b) => b.addEventListener("click", () => act(b, () => O.closeTrade(b.dataset.decline), "Échange refusé")));
    $$("[data-cancel]").forEach((b) => b.addEventListener("click", () => act(b, () => O.closeTrade(b.dataset.cancel), "Proposition annulée")));
    $$(".mini .card").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); BM.UI.openCardModal(el.dataset.card); }));
  }

  async function act(btn, fn, okMsg) {
    $$(".trade-actions button").forEach((b) => (b.disabled = true));
    try { await fn(); toast(okMsg); }
    catch (x) { toast(esc(x.message), "bad"); }
    BM.UI.updateChrome();
    renderSocial();
  }

  function friendRow(p, isFriend) {
    const n = ownedCount(p.collection);
    return `
      <div class="friend">
        <a class="friend-main" href="#joueur-${p.id}">
          <span class="av big">${initial(p.pseudo)}</span>
          <span><b>${esc(p.pseudo)}</b><small class="muted">${n} / ${BM.CARDS.length} cartes</small></span>
        </a>
        <div class="friend-actions">
          ${isFriend ? `<a class="btn btn-sm" href="#echange-${p.id}">⇄ Échanger</a>` : `<button class="btn btn-primary btn-sm" data-add="${p.id}">+ Ajouter</button>`}
        </div>
      </div>`;
  }

  /* =========================================================
     PROFIL D'UN AUTRE JOUEUR
     ========================================================= */
  async function renderPlayer(id) {
    if (offlineView()) return;
    if (id === O.me) { location.hash = "#profil"; return; }
    const my = ++token;
    loading("Profil");
    let p, friend;
    try { [p, friend] = await Promise.all([O.getPlayer(id), O.isFriend(id)]); }
    catch (e) { if (my === token) errorView("Profil", e); return; }
    if (my !== token) return;
    if (!p) return errorView("Profil", "Ce joueur n'existe pas.");

    const coll = p.collection || {};
    const total = BM.CARDS.length, uniq = ownedCount(coll);
    const pct = total ? Math.round((uniq / total) * 100) : 0;
    const st = p.stats || {};
    const vitrine = (p.vitrine || []).filter((cid) => G.card(cid) && (coll[cid])).map((cid) => ({ card: G.card(cid), level: bestLevelIn(coll, cid) }));
    const owned = BM.CARDS.filter((c) => coll[c.id])
      .sort((a, b) => G.rarityIndex(b.rarete) - G.rarityIndex(a.rarete) || a.nom.localeCompare(b.nom));
    const since = new Date(p.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    app().innerHTML = `
    <section class="profile">
      <a class="back-link" href="#social">‹ Social</a>
      <div class="panel profile-head">
        <div class="avatar letter">${initial(p.pseudo)}</div>
        <div class="profile-id">
          <h1 class="pseudo">${esc(p.pseudo)} <button class="btn btn-sm friends-btn" data-friends="${p.id}" data-pseudo="${esc(p.pseudo)}">👥 <span data-fcount>Amis</span></button></h1>
          <p class="muted small">Joueur depuis le ${since}</p>
        </div>
        <div class="head-actions">
          ${friend ? `<button class="btn btn-sm" id="unfriend" title="Retirer de mes amis">✓ Ami</button>` : `<button class="btn btn-sm" id="befriend">+ Ajouter</button>`}
          <a class="btn btn-primary btn-sm" href="#echange-${p.id}">⇄ Proposer un échange</a>
        </div>
      </div>

      <div class="panel vitrine-panel">
        <h2>Vitrine</h2>
        ${BM.UI.vitrineHTML(vitrine, false)}
      </div>

      <div class="tiles">
        <div class="tile wide">
          <span class="tile-label">Collection</span>
          <span class="tile-value">${uniq} <small>/ ${total} · ${pct} %</small></span>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="tile"><span class="tile-label">Cartes possédées</span><span class="tile-value">${totalCount(coll)}</span></div>
        <div class="tile"><span class="tile-label">Boosters ouverts</span><span class="tile-value">${st.boosters || 0}</span></div>
      </div>

      <div class="panel">
        <h2>Sa collection</h2>
        ${owned.length ? `<div class="grid other-coll">${owned.map((c) => {
          const n = Object.values(coll[c.id]).reduce((a, b) => a + b, 0);
          return `<div class="oc">${cardHTML(c, { level: bestLevelIn(coll, c.id), count: n })}${G.owned(c.id) ? "" : `<span class="tag-missing">Il te manque</span>`}</div>`;
        }).join("")}</div>` : `<p class="muted">Aucune carte pour l'instant.</p>`}
      </div>
    </section>`;

    fillCounts();
    const levelsOf = (cid) => ({ pseudo: p.pseudo, levels: coll[cid] || {} });
    $$(".other-coll .card, .vitrine .card").forEach((el) => el.addEventListener("click", () => BM.UI.openCardModal(el.dataset.card, levelsOf(el.dataset.card))));
    const bf = $("#befriend"), uf = $("#unfriend");
    if (bf) bf.addEventListener("click", async () => { bf.disabled = true; try { await O.addFriend(p.id); toast(`<b>${esc(p.pseudo)}</b> ajouté`); renderPlayer(id); } catch (x) { toast(esc(x.message), "bad"); bf.disabled = false; } });
    if (uf) uf.addEventListener("click", () => {
      BM.UI.openModal(`
        <div class="confirm">
          <h2>Retirer ${esc(p.pseudo)} de tes amis ?</h2>
          <div class="row"><button class="btn" data-no>Annuler</button><button class="btn btn-danger" data-yes>Retirer</button></div>
        </div>`);
      $("#modalContent [data-no]").addEventListener("click", BM.UI.closeModal);
      $("#modalContent [data-yes]").addEventListener("click", async () => {
        BM.UI.closeModal();
        try { await O.removeFriend(p.id); toast("Ami retiré"); } catch (x) { toast(esc(x.message), "bad"); }
        renderPlayer(id);
      });
    });
  }

  /* =========================================================
     CRÉER UNE PROPOSITION D'ÉCHANGE
     ========================================================= */
  async function renderTrade(id) {
    if (offlineView()) return;
    if (id === O.me) { location.hash = "#social"; return; }
    const my = ++token;
    loading("Échange");
    let p;
    try { await O.refresh(); p = await O.getPlayer(id); }
    catch (e) { if (my === token) errorView("Échange", e); return; }
    if (my !== token) return;
    if (!p) return errorView("Échange", "Ce joueur n'existe pas.");

    const give = [], get = [];
    let tab = "mine";
    const mineList = entries(G.state.collection);
    const theirList = entries(p.collection);
    const used = (arr, e) => arr.filter((x) => x.card === e.card.id && x.level === e.level).length;

    const draw = () => {
      const list = tab === "mine" ? mineList : theirList;
      const arr = tab === "mine" ? give : get;
      app().innerHTML = `
      <section class="trade-builder">
        <a class="back-link" href="#joueur-${p.id}">‹ ${esc(p.pseudo)}</a>
        <h1 class="page-title">Échange avec ${esc(p.pseudo)}</h1>
        <div class="panel tb-summary">
          <div class="tb-side"><h4>Tu donnes <span class="count-pill">${give.length}</span></h4>${chips(give, "give")}</div>
          <div class="trade-arrow">⇄</div>
          <div class="tb-side"><h4>Tu reçois <span class="count-pill">${get.length}</span></h4>${chips(get, "get")}</div>
          <button class="btn btn-primary btn-wide tb-send" id="sendTrade" ${give.length + get.length ? "" : "disabled"}>Envoyer la proposition</button>
        </div>
        <div class="tabs">
          <button class="tab ${tab === "mine" ? "on" : ""}" data-tab="mine">Mes cartes</button>
          <button class="tab ${tab === "theirs" ? "on" : ""}" data-tab="theirs">Cartes de ${esc(p.pseudo)}</button>
        </div>
        <p class="muted small">Touche une carte pour l'ajouter ${tab === "mine" ? "à ce que tu donnes" : "à ce que tu demandes"}.</p>
        ${list.length ? `<div class="grid tb-grid">${list.map((e, i) => {
          const left = e.count - used(arr, e);
          return `<div class="tb-item ${left <= 0 ? "empty-item" : ""}" data-i="${i}">${cardHTML(e.card, { level: e.level, count: left })}${left <= 0 ? `<span class="tb-taken">Tout sélectionné</span>` : ""}${tab === "theirs" && !G.owned(e.card.id) ? `<span class="tag-missing">Il te manque</span>` : ""}</div>`;
        }).join("")}</div>` : `<div class="empty">${tab === "mine" ? "Tu n'as aucune carte." : "Ce joueur n'a aucune carte."}</div>`}
      </section>`;

      $$(".tab").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; draw(); }));
      $$(".tb-item").forEach((el) => el.addEventListener("click", () => {
        const e = list[+el.dataset.i];
        if (e.count - used(arr, e) <= 0) return;
        if (arr.length >= 20) return toast("20 cartes maximum par côté", "bad");
        arr.push({ card: e.card.id, level: e.level });
        draw();
      }));
      $$("[data-rm]").forEach((b) => b.addEventListener("click", () => {
        const [side, k] = b.dataset.rm.split(":");
        (side === "give" ? give : get).splice(+k, 1);
        draw();
      }));
      $("#sendTrade").addEventListener("click", async () => {
        const btn = $("#sendTrade");
        btn.disabled = true; btn.textContent = "Envoi…";
        try {
          await O.proposeTrade(p.id, give, get);
          toast(`Proposition envoyée à <b>${esc(p.pseudo)}</b>`);
          location.hash = "#social";
        } catch (x) { toast(esc(x.message), "bad"); btn.disabled = false; btn.textContent = "Envoyer la proposition"; }
      });
    };

    const chips = (arr, side) => arr.length
      ? `<div class="chips-list">${arr.map((it, k) => {
          const c = G.card(it.card), r = G.rarity(c.rarete);
          return `<button class="tchip" style="--rc:${r.couleur}" data-rm="${side}:${k}" title="Retirer">${esc(c.nom)}${it.level > 1 ? ` <span class="gold">${stars(it.level)}</span>` : ""} <span class="x">✕</span></button>`;
        }).join("")}</div>`
      : `<p class="muted small">${side === "give" ? "Rien (cadeau demandé)" : "Rien (c'est un cadeau)"}</p>`;

    draw();
  }

  /* =========================================================
     AMIS D'UN JOUEUR (bouton « Amis » à côté du pseudo, sur tous les profils)
     ========================================================= */
  const friendsCache = {}; // id → liste (évite de recharger deux fois)
  async function loadFriends(id, fresh) {
    if (fresh || !friendsCache[id]) friendsCache[id] = await O.playerFriends(id);
    return friendsCache[id];
  }
  // Affiche le nombre d'amis sur les boutons présents dans la page
  function fillCounts() {
    if (!O.isOn()) return;
    $$("[data-friends]").forEach(async (b) => {
      try {
        const list = await loadFriends(b.dataset.friends, true);
        const span = $("[data-fcount]", b);
        if (span) span.textContent = `${list.length} ami${list.length > 1 ? "s" : ""}`;
      } catch (e) { /* le bouton reste « Amis » */ }
    });
  }

  async function openFriends(id, pseudo) {
    const mine = id === O.me;
    BM.UI.openModal(`<div class="friends-modal"><h2>${mine ? "Mes amis" : `Amis de ${esc(pseudo)}`}</h2><div class="empty loading-box"><span class="spinner"></span> Chargement…</div></div>`);
    let list, myIds;
    try { [list, myIds] = await Promise.all([loadFriends(id, true), O.myFriendIds()]); }
    catch (e) { $("#modalContent .friends-modal").innerHTML = `<h2>Amis</h2><p class="muted">${esc(e.message || e)}</p>`; return; }
    const box = $("#modalContent .friends-modal");
    if (!box) return; // fenêtre fermée entre-temps
    const action = (f) => f.id === O.me ? `<span class="muted small">C'est toi</span>`
      : myIds.includes(f.id) ? `<button class="btn btn-sm" disabled>✓ Ami</button>`
      : `<button class="btn btn-primary btn-sm" data-fadd="${f.id}" data-fname="${esc(f.pseudo)}">+ Ajouter</button>`;
    box.innerHTML = `
      <h2>${mine ? "Mes amis" : `Amis de ${esc(pseudo)}`} <span class="count-pill">${list.length}</span></h2>
      ${list.length ? `<div class="friends friends-list">${list.map((f) => `
        <div class="friend">
          <a class="friend-main" href="#joueur-${f.id}" data-fgo>
            <span class="av big">${initial(f.pseudo)}</span>
            <span><b>${esc(f.pseudo)}</b><small class="muted">${ownedCount(f.collection)} / ${BM.CARDS.length} cartes</small></span>
          </a>
          <div class="friend-actions">
            ${f.id === O.me ? "" : `<a class="btn btn-sm" href="#joueur-${f.id}" data-fgo>Voir le profil</a>`}
            ${action(f)}
          </div>
        </div>`).join("")}</div>`
        : `<p class="muted">${mine ? "Tu n'as pas encore d'amis. Ajoute-les depuis l'onglet Social !" : `${esc(pseudo)} n'a pas encore d'amis.`}</p>`}
      <div class="row"><button class="btn" data-fclose>Fermer</button></div>`;
    $$("[data-fgo]", box).forEach((a) => a.addEventListener("click", () => BM.UI.closeModal()));
    $("[data-fclose]", box).addEventListener("click", BM.UI.closeModal);
    $$("[data-fadd]", box).forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await O.addFriend(b.dataset.fadd);
        b.textContent = "✓ Ami"; b.classList.remove("btn-primary");
        toast(`<b>${b.dataset.fname}</b> ajouté à tes amis`);
        if (mine || location.hash === "#profil") fillCounts();
      } catch (x) { toast(esc(x.message), "bad"); b.disabled = false; }
    }));
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-friends]");
    if (b) { e.preventDefault(); openFriends(b.dataset.friends, b.dataset.pseudo); }
  });
  BM.Social = { fillCounts, openFriends };
  fillCounts();

  BM.UI.page("social", renderSocial);
  BM.UI.prefixPage("joueur-", renderPlayer);
  BM.UI.prefixPage("echange-", renderTrade);
})();
