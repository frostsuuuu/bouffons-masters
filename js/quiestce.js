/* =========================================================
   ONGLET « QUI EST-CE ? » : mini-jeu en 1 contre 1 entre amis
   ---------------------------------------------------------
   - On invite un ami ; 24 cartes au hasard sont tirées dans la
     collection de celui qui invite.
   - Chacun choisit sa carte secrète, puis on joue chacun son tour
     (les questions se posent à l'oral, en vocal) : on grise les
     cartes éliminées, puis on valide son tour.
   - « Deviner » : si c'est juste on gagne, sinon l'adversaire
     joue 2 tours d'affilée.
   Tout passe par le serveur (supabase/qui-est-ce.sql) : personne
   ne peut voir la carte de l'autre.
   ========================================================= */
(function () {
  const G = BM.Game;
  const O = BM.Online;
  const { $, $$, esc, cardHTML, toast } = BM.UI;
  const app = () => BM.UI.app;
  const QE = () => O.qe;

  let token = 0;          // évite d'afficher une page chargée trop tard
  let poll = null;        // rafraîchissement automatique
  let game = null;        // partie affichée
  let local = null;       // { id, turn_no, down:Set } : cartes que je grise pendant mon tour
  let picking = null;     // carte sélectionnée pendant le choix de la carte secrète
  let guessing = false;   // mode « deviner » activé
  let busy = false;
  let pushTimer = null;

  const stopPoll = () => { clearInterval(poll); poll = null; };
  const card = (id) => G.card(id) || { id, nom: "Carte inconnue", rarete: "commune", image: "" };
  const initial = (p) => esc((p || "?").trim().charAt(0).toUpperCase());

  function offline(title) {
    if (!O.configured()) {
      app().innerHTML = `<section><h1 class="page-title">${title}</h1><div class="empty">Le mode en ligne n'est pas activé : le Qui est-ce se joue à deux, il a besoin du serveur.</div></section>`;
      return true;
    }
    if (!O.isOn()) {
      app().innerHTML = `<section><h1 class="page-title">${title}</h1><div class="empty">Impossible de joindre le serveur pour l'instant.<br><br><button class="btn btn-primary" id="retry">Réessayer</button></div></section>`;
      $("#retry").addEventListener("click", async () => { await O.init(); BM.UI.render(); });
      return true;
    }
    return false;
  }
  const loading = (t) => (app().innerHTML = `<section><h1 class="page-title">${t}</h1><div class="empty loading-box"><span class="spinner"></span> Chargement…</div></section>`);

  /* =========================================================
     ACCUEIL : invitations, parties en cours, défier un ami
     ========================================================= */
  async function renderLobby() {
    stopPoll(); game = null; local = null;
    if (offline("Qui est-ce ?")) return;
    const my = ++token;
    loading("Qui est-ce ?");
    let games, soc;
    try { [games, soc] = await Promise.all([QE().list(), O.social()]); }
    catch (e) { if (my === token) app().innerHTML = `<section><h1 class="page-title">Qui est-ce ?</h1><div class="empty">${esc(e.message)}</div></section>`; return; }
    if (my !== token) return;
    drawLobby(games, soc.friends);
    BM.UI.updateChrome();
    // les invitations et les coups des amis arrivent tout seuls
    let sig = JSON.stringify(games.map((g) => [g.id, g.status, g.my_turn, g.my_secret]));
    poll = setInterval(async () => {
      if (document.hidden || BM.UI.currentPage !== "quiestce") return;
      try {
        const g2 = await QE().list();
        const s2 = JSON.stringify(g2.map((g) => [g.id, g.status, g.my_turn, g.my_secret]));
        if (s2 !== sig && BM.UI.currentPage === "quiestce") { sig = s2; drawLobby(g2, soc.friends); BM.UI.updateChrome(); }
      } catch (e) { /* on réessaiera */ }
    }, 4000);
  }

  function statusText(g) {
    const o = esc(g.opponent.pseudo || "?");
    if (g.status === "invite") return g.role === "guest" ? `<b>${o}</b> t'invite à jouer` : `En attente de la réponse de <b>${o}</b>`;
    if (g.status === "choose") return g.my_secret ? `En attente du choix de <b>${o}</b>` : `<b>Choisis ta carte</b> contre ${o}`;
    if (g.status === "play") return g.my_turn ? `<b>À toi de jouer</b> contre ${o}` : `Tour de <b>${o}</b>`;
    if (g.status === "done") return g.winner === "me" ? `Victoire contre <b>${o}</b> 🏆` : `Défaite contre <b>${o}</b>`;
    if (g.status === "declined") return `${o} a refusé`;
    return `Partie annulée avec ${o}`;
  }

  function drawLobby(games, friends) {
    const invites = games.filter((g) => g.status === "invite" && g.role === "guest");
    const running = games.filter((g) => ["choose", "play"].includes(g.status) || (g.status === "invite" && g.role === "host"));
    const past = games.filter((g) => ["done", "declined", "cancelled"].includes(g.status)).slice(0, 6);
    const busyWith = new Set(games.filter((g) => ["invite", "choose", "play"].includes(g.status)).map((g) => g.opponent.id));

    app().innerHTML = `
    <section class="qe-lobby">
      <div class="qe-head"><a class="btn btn-sm" href="#minijeux">‹ Mini-jeux</a><h1 class="page-title">Qui est-ce ?</h1></div>
      <p class="muted">Défie un ami en 1 contre 1 : 24 cartes de ta collection, chacun choisit la sienne, et vous posez vos questions en vocal.</p>

      ${invites.length ? `
      <div class="panel hl">
        <h2>Invitations reçues <span class="count-pill">${invites.length}</span></h2>
        <div class="qe-list">${invites.map((g) => `
          <div class="qe-row"><span class="av">${initial(g.opponent.pseudo)}</span><span class="qe-row-txt">${statusText(g)}</span>
            <button class="btn btn-sm" data-decline="${g.id}">Refuser</button>
            <button class="btn btn-primary btn-sm" data-accept="${g.id}">✓ Jouer</button></div>`).join("")}</div>
      </div>` : ""}

      ${running.length ? `
      <div class="panel">
        <h2>Parties en cours</h2>
        <div class="qe-list">${running.map((g) => `
          <div class="qe-row ${(g.my_turn || (g.status === "choose" && !g.my_secret)) ? "is-hot" : ""}"><span class="av">${initial(g.opponent.pseudo)}</span><span class="qe-row-txt">${statusText(g)}</span>
            ${g.status === "invite" ? `<button class="btn btn-sm" data-cancel="${g.id}">Annuler</button>` : `<a class="btn btn-primary btn-sm" href="#qe-${g.id}">Reprendre</a>`}</div>`).join("")}</div>
      </div>` : ""}

      <div class="panel">
        <h2>Défier un ami</h2>
        ${friends.length ? `<div class="qe-list">${friends.map((p) => `
          <div class="qe-row"><span class="av">${initial(p.pseudo)}</span><span class="qe-row-txt"><b>${esc(p.pseudo)}</b></span>
            ${busyWith.has(p.id) ? `<span class="muted small">partie en cours</span>` : `<button class="btn btn-primary btn-sm" data-invite="${p.id}">❓ Défier</button>`}</div>`).join("")}</div>`
          : `<p class="muted">Ajoute d'abord des amis dans l'onglet <a href="#social">Social</a>.</p>`}
      </div>

      ${past.length ? `
      <div class="panel">
        <h2>Dernières parties</h2>
        <div class="qe-list">${past.map((g) => `
          <div class="qe-row is-past"><span class="av">${initial(g.opponent.pseudo)}</span><span class="qe-row-txt">${statusText(g)}</span>
            ${g.status === "done" ? `<a class="btn btn-sm" href="#qe-${g.id}">Voir</a>` : ""}</div>`).join("")}</div>
      </div>` : ""}
    </section>`;

    const act = async (btn, fn, after) => {
      if (busy) return; busy = true; btn.disabled = true;
      try { const r = await fn(); after && after(r); }
      catch (e) { toast(esc(e.message), "bad"); btn.disabled = false; }
      busy = false;
    };
    $$("[data-invite]").forEach((b) => b.addEventListener("click", () => act(b, () => QE().invite(b.dataset.invite), (g) => {
      toast(`Invitation envoyée à <b>${esc(g.opponent.pseudo)}</b> !`);
      location.hash = "#qe-" + g.id;
    })));
    $$("[data-accept]").forEach((b) => b.addEventListener("click", () => act(b, () => QE().respond(b.dataset.accept, true), (g) => { location.hash = "#qe-" + g.id; })));
    $$("[data-decline]").forEach((b) => b.addEventListener("click", () => act(b, () => QE().respond(b.dataset.decline, false), () => renderLobby())));
    $$("[data-cancel]").forEach((b) => b.addEventListener("click", () => act(b, () => QE().quit(b.dataset.cancel), () => renderLobby())));
  }

  /* =========================================================
     PARTIE
     ========================================================= */
  async function renderGame(id) {
    stopPoll(); guessing = false; picking = null;
    if (offline("Qui est-ce ?")) return;
    const my = ++token;
    if (!game || game.id !== id) { game = null; local = null; loading("Qui est-ce ?"); }
    try { game = await QE().state(id); }
    catch (e) { if (my === token) app().innerHTML = `<section><h1 class="page-title">Qui est-ce ?</h1><div class="empty">${esc(e.message)}<br><br><a class="btn" href="#quiestce">Retour</a></div></section>`; return; }
    if (my !== token) return;
    syncLocal();
    drawGame();
    poll = setInterval(async () => {
      if (document.hidden || busy || BM.UI.currentPage !== "qe-" + id) return;
      try {
        const g2 = await QE().state(id);
        if (BM.UI.currentPage !== "qe-" + id || busy) return;
        const before = sigOf(game), after = sigOf(g2);
        const wasMyTurn = game.my_turn;
        game = g2;
        if (before !== after) {
          syncLocal();
          drawGame();
          if (!wasMyTurn && g2.my_turn) toast("À toi de jouer !");
          BM.UI.updateChrome();
        }
      } catch (e) { /* on réessaiera */ }
    }, 1500);
  }

  // Ce qui, quand ça change, demande de redessiner (pendant mon tour, mes clics locaux priment)
  const sigOf = (g) => JSON.stringify([g.status, g.my_turn, g.turn_no, g.my_secret, g.opp_chosen, g.opp_down, g.winner, g.last_event, g.my_turn ? null : g.my_down]);

  // Mes cartes grisées : copie locale modifiable pendant mon tour
  function syncLocal() {
    if (!game) return;
    const keep = local && local.id === game.id && local.turn_no === game.turn_no && game.my_turn;
    if (!keep) local = { id: game.id, turn_no: game.turn_no, down: new Set(game.my_down || []) };
  }

  function phaseBanner() {
    const g = game, o = esc(g.opponent.pseudo || "?"), ev = g.last_event || {};
    const evBy = ev.by && (ev.by === g.role ? "me" : "opp");
    if (g.status === "invite") return g.role === "host"
      ? `<div class="qe-banner wait">⏳ Invitation envoyée à <b>${o}</b>. La partie commence dès qu'il accepte (l'onglet se met à jour tout seul).</div>`
      : `<div class="qe-banner hot"><b>${o}</b> t'invite à jouer. <button class="btn btn-sm" data-decline>Refuser</button> <button class="btn btn-primary btn-sm" data-accept>✓ Jouer</button></div>`;
    if (g.status === "choose") return g.my_secret
      ? `<div class="qe-banner wait">⏳ Ta carte est choisie. En attente de <b>${o}</b>…</div>`
      : `<div class="qe-banner hot">👆 <b>Choisis ta carte secrète</b> : touche une carte puis valide. ${o} devra la deviner.${g.opp_chosen ? ` <span class="muted">(${o} a déjà choisi)</span>` : ""}</div>`;
    if (g.status === "done") {
      if (ev.type === "abandon") return `<div class="qe-banner ${g.winner === "me" ? "win" : "lose"}">${evBy === "me" ? "Tu as abandonné." : `<b>${o}</b> a abandonné : tu gagnes ! 🏆`}</div>`;
      return g.winner === "me"
        ? `<div class="qe-banner win">🏆 <b>Gagné !</b> Tu as trouvé la carte de ${o} : <b>${esc(card(g.opp_secret).nom)}</b>. 🎁 +1 pack récompense ! <button class="btn btn-primary btn-sm" data-gift>Ouvrir</button></div>`
        : `<div class="qe-banner lose">😵 <b>Perdu…</b> ${o} a trouvé ta carte. La sienne était <b>${esc(card(g.opp_secret).nom)}</b>.</div>`;
    }
    // en jeu
    let info = "";
    if (ev.type === "guess" && !ev.ok) info = evBy === "me"
      ? ` Raté : ce n'était pas <b>${esc(card(ev.card).nom)}</b>.`
      : ` ${o} a tenté <b>${esc(card(ev.card).nom)}</b> : raté !`;
    if (g.my_turn) {
      const extra = g.bonus > 0 ? ` <span class="qe-bonus">Tu as 2 tours d'affilée</span>` : (ev.type === "bonus_turn" && evBy === "me" ? ` <span class="qe-bonus">2e tour bonus</span>` : "");
      return `<div class="qe-banner hot">🎤 <b>À toi de jouer</b> (tour ${g.turn_no}) : pose ta question en vocal, grise les cartes éliminées puis valide.${info}${extra}</div>`;
    }
    const extra = g.bonus > 0 ? ` <span class="qe-bonus">${o} joue 2 tours d'affilée</span>` : "";
    return `<div class="qe-banner wait">⏳ Tour de <b>${o}</b> (tour ${g.turn_no}). Réponds à sa question en vocal.${info}${extra}</div>`;
  }

  function drawGame() {
    const g = game;
    if (!g) return;
    const o = esc(g.opponent.pseudo || "?");
    const myDown = g.my_turn ? local.down : new Set(g.my_down || []);
    const canChoose = g.status === "choose" && !g.my_secret;
    const canPlay = g.status === "play" && g.my_turn;
    const done = g.status === "done";
    const left = g.cards.length - myDown.size;
    const oppLeft = g.cards.length - (g.opp_down || []).length;

    app().innerHTML = `
    <section class="qe-game ${canPlay ? "is-my-turn" : ""} ${guessing ? "is-guessing" : ""}">
      <div class="qe-head">
        <a class="btn btn-sm" href="#quiestce">‹ Parties</a>
        <h1 class="page-title">Qui est-ce ? <span class="muted">vs ${o}</span></h1>
      </div>
      ${phaseBanner()}

      <div class="qe-layout">
        <aside class="qe-side">
          <div class="panel qe-mine">
            <h3>Ta carte</h3>
            ${g.my_secret ? `<div class="qe-secret">${cardHTML(card(g.my_secret), {})}</div>`
              : `<div class="qe-secret empty-slot">${canChoose && picking ? cardHTML(card(picking), {}) : "?"}</div>
                 ${canChoose ? `<button class="btn btn-primary btn-wide" id="qeChoose" ${picking ? "" : "disabled"}>✓ Valider ma carte</button>` : ""}`}
          </div>
          ${done && g.opp_secret ? `<div class="panel qe-mine"><h3>Carte de ${o}</h3><div class="qe-secret opp">${cardHTML(card(g.opp_secret), {})}</div></div>` : ""}
          ${g.status === "play" || done ? `
          <div class="panel qe-score">
            <div><span class="muted small">Il te reste</span><b>${left}</b><span class="muted small">carte${left > 1 ? "s" : ""}</span></div>
            <div><span class="muted small">Il reste à ${o}</span><b>${oppLeft}</b><span class="muted small">carte${oppLeft > 1 ? "s" : ""}</span></div>
          </div>` : ""}
          ${canPlay ? `
          <div class="qe-actions">
            <button class="btn btn-primary btn-wide" id="qeEnd">✓ Valider mon tour</button>
            <button class="btn btn-wide ${guessing ? "btn-danger" : ""}" id="qeGuess">${guessing ? "✕ Annuler" : "🎯 Deviner sa carte"}</button>
          </div>` : ""}
          ${done ? `<div class="qe-actions"><button class="btn btn-primary btn-wide" id="qeAgain">🔁 Rejouer contre ${o}</button></div>` : ""}
          ${["choose", "play"].includes(g.status) || (g.status === "invite" && g.role === "host")
            ? `<button class="btn btn-sm qe-quit" id="qeQuit">${g.status === "invite" ? "Annuler l'invitation" : "Abandonner"}</button>` : ""}
        </aside>

        <div class="qe-board">
          ${guessing && canPlay ? `<p class="qe-hint">🎯 Touche la carte que tu penses être celle de ${o}.</p>` : ""}
          <div class="qe-grid">${g.cards.map((id) => {
            const isDown = myDown.has(id), isMine = id === g.my_secret, isOpp = done && id === g.opp_secret;
            return `<button class="qe-card ${isDown ? "down" : ""} ${isMine ? "mine" : ""} ${isOpp ? "opp" : ""} ${picking === id ? "picked" : ""}" data-card="${esc(id)}">
              ${cardHTML(card(id), {})}${isMine ? `<span class="qe-tag">TA CARTE</span>` : ""}${isOpp ? `<span class="qe-tag opp">SA CARTE</span>` : ""}<i class="qe-x"></i></button>`;
          }).join("")}</div>
        </div>
      </div>
    </section>`;
    bind();
  }

  function bind() {
    const g = game;
    $$(".qe-card").forEach((b) => b.addEventListener("click", () => onCard(b.dataset.card)));
    const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };
    on("#qeChoose", () => run(() => QE().choose(g.id, picking), () => { picking = null; toast("Carte choisie ! 🤫"); }));
    on("#qeEnd", () => run(() => QE().endTurn(g.id, [...local.down]), (r) => toast(r.my_turn ? "Tour validé : tu rejoues (tour bonus) !" : "Tour validé, à l'autre !")));
    on("#qeGuess", () => { guessing = !guessing; drawGame(); });
    on("#qeQuit", () => {
      const msg = g.status === "invite" ? "Annuler l'invitation ?" : `Abandonner la partie ? ${esc(g.opponent.pseudo)} gagnera.`;
      confirmBox(msg, "Oui", () => run(() => QE().quit(g.id), (r) => { if (r.status !== "done") location.hash = "#quiestce"; }));
    });
    on("#qeAgain", () => run(() => QE().invite(g.opponent.id), (r) => { toast(`Invitation envoyée à <b>${esc(r.opponent.pseudo)}</b> !`); location.hash = "#qe-" + r.id; }, true));
    on("[data-accept]", () => run(() => QE().respond(g.id, true)));
    on("[data-decline]", () => run(() => QE().respond(g.id, false), () => { location.hash = "#quiestce"; }));
  }

  function onCard(id) {
    const g = game;
    if (g.status === "choose" && !g.my_secret) { picking = picking === id ? null : id; return drawGame(); }
    if (g.status !== "play" || !g.my_turn) {
      if (g.status === "play") toast("Attends ton tour pour griser des cartes.");
      return;
    }
    if (guessing) {
      if (local.down.has(id)) return toast("Tu as déjà éliminé cette carte.");
      const c = card(id);
      return confirmBox(`Tu penses que la carte de <b>${esc(g.opponent.pseudo)}</b> est <b>${esc(c.nom)}</b> ?<br><span class="muted small">Si tu te trompes, il jouera 2 tours d'affilée.</span>`, "🎯 Deviner", () => {
        guessing = false;
        run(() => QE().guess(g.id, id, [...local.down]), (r) => {
          if (r.status === "done") toast("🏆 Bien joué, c'était la bonne carte !");
          else toast("Raté ! L'adversaire joue 2 tours.", "bad");
        });
      });
    }
    local.down.has(id) ? local.down.delete(id) : local.down.add(id);
    const el = $(`.qe-card[data-card="${CSS.escape(id)}"]`);
    if (el) el.classList.toggle("down", local.down.has(id));
    const leftEl = $(".qe-score div b"); if (leftEl) leftEl.textContent = g.cards.length - local.down.size;
    // l'adversaire voit ma progression presque en direct
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { if (game && game.my_turn) QE().setDown(g.id, [...local.down]).catch(() => {}); }, 600);
  }

  async function run(fn, after, leave) {
    if (busy) return;
    busy = true;
    $$(".qe-game button").forEach((b) => (b.disabled = true));
    try {
      const r = await fn();
      busy = false;
      if (!leave && r && r.id === (game && game.id)) { game = r; syncLocal(); drawGame(); }
      after && after(r);
    } catch (e) {
      busy = false;
      toast(esc(e.message), "bad");
      if (game) { try { game = await QE().state(game.id); } catch (_) {} syncLocal(); drawGame(); }
    }
    BM.UI.updateChrome();
  }

  function confirmBox(html, yes, onYes) {
    BM.UI.openModal(`<div class="confirm"><p>${html}</p><div class="pull-actions"><button class="btn" data-no>Annuler</button><button class="btn btn-primary" data-yes>${yes}</button></div></div>`);
    $("#modalContent [data-no]").addEventListener("click", BM.UI.closeModal);
    $("#modalContent [data-yes]").addEventListener("click", () => { BM.UI.closeModal(); onYes(); });
  }

  // On quitte l'onglet : on arrête de rafraîchir
  window.addEventListener("hashchange", () => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h !== "quiestce" && !h.startsWith("qe-")) stopPoll();
  });

  BM.UI.page("quiestce", renderLobby);
  BM.UI.prefixPage("qe-", renderGame);
})();
