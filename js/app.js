/* =========================================================
   INTERFACE : pages, cartes, animations
   ========================================================= */
(function () {
  const C = BM.CONFIG;
  const G = BM.Game;
  const app = document.getElementById("app");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="bmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3cac"/><stop offset="0.55" stop-color="#7b5cff"/><stop offset="1" stop-color="#2bd2ff"/></linearGradient></defs><rect x="15" y="25" width="34" height="34" rx="6" transform="rotate(-7 32 42)" fill="#16123a" stroke="url(#bmg)" stroke-width="3"/><path d="M17 31 C15 22 11 16 5 13 C14 12 21 16 25 24 C27 14 29 8 32 5 C35 8 37 14 39 24 C43 16 50 12 59 13 C53 16 49 22 47 31 Z" fill="url(#bmg)"/><rect x="15" y="29" width="34" height="6" rx="3" fill="#ffd36e"/><circle cx="5" cy="13" r="3.6" fill="#ffd36e"/><circle cx="32" cy="5" r="3.6" fill="#ffd36e"/><circle cx="59" cy="13" r="3.6" fill="#ffd36e"/><text x="32" y="53" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="15" fill="#fff" text-anchor="middle" transform="rotate(-7 32 47)">BM</text></svg>`;

  /* ================= Petits utilitaires ================= */
  // Niveau 1 = pas d'étoile, niveau 2 = ★, niveau 3 = ★★ …
  // Étoiles : 1 à 3 dorées, puis 1 à 3 arc-en-ciel (niveau 1 = sans étoile)
  const PER_COLOR = () => C.fusion.etoilesParCouleur || 3;
  const starTier = (level) => {
    const n = G.starsOf(level), per = PER_COLOR();
    return n > per ? { n: n - per, rainbow: true } : { n, rainbow: false };
  };
  const stars = (level) => {
    const t = starTier(level);
    if (t.n <= 0) return "";
    return `<span class="${t.rainbow ? "stars-rainbow" : "stars-gold"}">${"★".repeat(t.n)}</span>`;
  };
  const starsText = (level) => {
    const t = starTier(level);
    if (t.n <= 0) return "Sans étoile";
    return `${t.n} étoile${t.n > 1 ? "s" : ""}${t.rainbow ? " arc-en-ciel" : ""}`;
  };
  const starsLabel = (level) => (level <= 1 ? "Sans étoile" : `${stars(level)} <small>(${starsText(level)})</small>`);
  const leftLabel = (n) => (n === Infinity ? "∞" : n);
  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
  }

  /* ================= Composants ================= */
  function imgHTML(card) {
    const src = card.image || G.placeholder(card);
    return `<img src="${esc(src)}" alt="" loading="lazy" draggable="false" data-ph="${esc(card.id)}">`;
  }
  // Si une image est introuvable → illustration provisoire
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.ph && !img.dataset.failed) {
      img.dataset.failed = "1";
      img.src = G.placeholder(G.card(img.dataset.ph));
    }
  }, true);

  function cardHTML(card, o = {}) {
    const r = G.rarity(card.rarete);
    const lvl = o.level || 1;
    const st = G.statsAt(card, lvl);
    const hidden = o.missing && !C.afficherNomCartesManquantes;
    return `
    <div class="card r-${r.id} ${o.missing ? "missing" : ""} ${o.big ? "big" : ""}" style="--rc:${r.couleur}" data-card="${esc(card.id)}">
      <div class="card-inner">
        <div class="card-head">
          <span class="card-name">${hidden ? "???" : esc(card.nom)}</span>
        </div>
        <div class="card-art">${imgHTML(card)}</div>
        <div class="card-foot">
          <span class="card-rarity">${esc(r.nom)}</span>
          ${st && !o.missing ? `<span class="card-stats"><b title="Attaque">⚔ ${st.atk}</b><b title="Défense">🛡 ${st.def}</b></span>` : ""}
        </div>
      </div>
      ${lvl > 1 && !o.missing ? `<span class="card-stars ${starTier(lvl).rainbow ? "is-rainbow" : "is-gold"}">${stars(lvl)}</span>` : ""}
      ${o.count > 1 ? `<span class="card-count">×${o.count}</span>` : ""}
      ${o.isNew ? `<span class="card-new">NOUVEAU</span>` : ""}
    </div>`;
  }

  function toast(msg, type = "") {
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.innerHTML = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  /* ================= Barre du haut ================= */
  function updateChrome() {
    const left = G.boostersLeft();
    $("#boosterCount").textContent = leftLabel(left);
    const ms = G.msUntilNext();
    $("#pillTimer").textContent = ms > 0 ? clock(ms) : "";
    $("#pillTimer").hidden = !(ms > 0);
    $("#boosterPill").classList.toggle("is-empty", left === 0);
    const sb = $("#socialBadge");
    if (sb) { const n = BM.Online.incoming; sb.hidden = !n; sb.textContent = n; }
    const nf = G.fusables().length;
    const b = $("#fusionBadge");
    b.hidden = nf === 0;
    b.textContent = nf;
    $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === currentPage || (a.dataset.page === "social" && /^(joueur|echange)-/.test(currentPage))));
  }

  /* =========================================================
     LE BOOSTER (forme "vrai paquet")
     Le visuel est rendu 2 fois : le corps et le haut (qui se déchire).
     ========================================================= */
  // Contour dentelé (soudures du haut et du bas) + ligne de déchirure
  const TEAR_Y = 9; // % de la hauteur du paquet
  const PACK_CLIPS = (() => {
    const teeth = 22, depth = 1.3;
    const top = [], bottom = [], tear = [];
    for (let i = 0; i <= teeth; i++) {
      const x = (i / teeth) * 100;
      top.push(`${x.toFixed(2)}% ${(i % 2 ? depth : 0).toFixed(2)}%`);
      bottom.unshift(`${x.toFixed(2)}% ${(100 - (i % 2 ? depth : 0)).toFixed(2)}%`);
    }
    const n = 34;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 100;
      const y = TEAR_Y + (i % 2 ? 0.7 : -0.5) + Math.sin(i * 1.7) * 0.4;
      tear.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
    return {
      body: `polygon(${[...tear, ...bottom].join(",")})`,
      cap: `polygon(${[...top, ...tear.slice().reverse()].join(",")})`
    };
  })();

  function packFaceHTML() {
    return `
      <div class="pf">
        <div class="pf-wisps"></div>
        <div class="pf-stars"></div>
        <div class="pf-energy"></div>
        <div class="pf-crimp pf-crimp-top"></div>
        <div class="pf-logo"></div>
        <div class="pf-ribbon">BOOSTER · ${C.cartesParBooster} CARTES</div>
        <div class="pf-pillow"></div>
        <div class="pf-gloss"></div>
        <div class="pf-crimp pf-crimp-bottom"></div>
      </div>`;
  }

  function packHTML(locked) {
    return `
      <div class="pack3d ${locked ? "locked" : ""}" id="pack">
        <div class="pk-tilt">
          <div class="pk pk-body" style="clip-path:${PACK_CLIPS.body}">${packFaceHTML()}</div>
          <div class="pk pk-cap" style="clip-path:${PACK_CLIPS.cap}">${packFaceHTML()}</div>
          <div class="pk-tear" style="top:${TEAR_Y}%"><span>✂</span></div>
          ${locked ? `<div class="pk-lock">🔒</div>` : ""}
        </div>
        <div class="pk-beam" style="top:${TEAR_Y}%"></div>
      </div>`;
  }

  /* =========================================================
     PAGE : BOOSTER (page principale)
     ========================================================= */
  let pull = null; // { results, index, flipped:Set, done, opening }
  let seq = 0;     // identifiant de l'animation en cours (pour l'annuler si on change de page)

  function slotsHTML() {
    return pull.results.map((x, i) => {
      const r = G.rarity(x.card.rarete);
      return `
        <div class="slot" data-i="${i}" style="--rc:${r.couleur}">
          <div class="flip-inner">
            <div class="flip-back"><div class="card-back"><span class="cb-logo">${LOGO}</span></div></div>
            <div class="flip-front">${cardHTML(x.card, { isNew: x.isNew, big: true })}</div>
          </div>
        </div>`;
    }).join("");
  }

  // idle = true : écran du booster fermé. Le bouton « Ouvrir le booster » est exactement là où sera
  // ensuite le bouton pour faire défiler les cartes : on n'a jamais besoin de bouger la souris.
  function stackUiHTML(idle) {
    const n = idle ? C.cartesParBooster || 5 : pull.results.length;
    return `
      <div class="stack-ui${idle ? " idle-ui" : ""}" id="stackUi">
        <div class="stack-nav">
          <button class="round-btn" id="prevBtn" aria-label="Carte précédente">‹</button>
          <div class="dots">${Array.from({ length: n }, (_, i) => `<i data-dot="${i}"></i>`).join("")}</div>
          <button class="round-btn" id="nextBtn" aria-label="Carte suivante">›</button>
        </div>
        <button class="btn btn-primary btn-wide" id="mainBtn">${idle ? '<i class="ico-pack" aria-hidden="true"></i>Ouvrir le booster' : ""}</button>
        <p class="muted small hint-text">${idle ? "Touche le booster ou le bouton pour l'ouvrir" : C.retournementAuto ? "Touche la carte pour la voir en grand · flèche ou bouton pour passer à la suivante" : "Touche la carte pour la retourner, puis pour la voir en grand · flèche ou bouton pour passer à la suivante"}</p>
      </div>`;
  }

  function renderBooster() {
    if (pull && !pull.opening) return pull.done ? renderRecap() : renderStack();
    pull = null;
    const left = G.boostersLeft();
    const locked = left === 0;
    app.innerHTML = `
    <section class="booster-page reveal">
      <p class="counter" id="topLine">${locked
        ? `Prochain booster dans <b class="cd" data-countdown>${clock(G.msUntilNext())}</b>`
        : `<b>${leftLabel(left)}</b> booster${left > 1 ? "s" : ""} disponible${left > 1 ? "s" : ""}`}</p>
      <div class="stage idle${locked ? "" : " ready"}" id="stage">${packHTML(locked)}</div>
      ${locked
        ? `<p class="muted small pack-hint" id="packHint">Un nouveau booster toutes les ${C.rechargeMinutes} minute${C.rechargeMinutes > 1 ? "s" : ""}${G.unlimited() ? "" : ` (jusqu'à ${C.boostersMax} en réserve)`}.</p>`
        : stackUiHTML(true)}
    </section>`;

    const pack = $("#pack");
    if (locked) return;
    // Petit effet 3D quand la souris bouge sur le paquet
    const tilt = $(".pk-tilt", pack);
    pack.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || pack.classList.contains("tearing")) return;
      const r = pack.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 12}deg)`;
      tilt.style.setProperty("--gx", (x + 0.5) * 100 + "%");
    });
    pack.addEventListener("pointerleave", () => { tilt.style.transform = ""; });
    pack.addEventListener("click", () => openPack());
    $("#mainBtn").addEventListener("click", () => openPack());
  }

  /* ---------- Ouverture : déchirure → cartes qui sortent → pile ---------- */
  let asking = false; // demande d'ouverture en cours auprès du serveur
  async function openPack() {
    if (pull || asking || !$("#pack")) return; // déjà en cours d'ouverture
    let res;
    if (BM.Online.configured() && G.state.account) {
      // En ligne : c'est le serveur qui tire les cartes (anti-triche)
      asking = true;
      const btn = $("#mainBtn");
      if (btn) { btn.disabled = true; btn.textContent = "Ouverture…"; }
      try { res = G.applyServerBooster(await BM.Online.openBooster()); }
      catch (e) {
        asking = false;
        toast(esc(e.message || e), "bad");
        await BM.Online.refresh().catch(() => {});
        updateChrome();
        if (currentPage === "booster") renderBooster();
        return;
      }
      asking = false;
      if (!$("#pack") || currentPage !== "booster") { updateChrome(); return; } // page quittée entre-temps
      if (btn) btn.disabled = false;
    } else {
      res = G.openBooster();
    }
    if (!res) return renderBooster();
    const id = ++seq;
    const alive = () => id === seq && $("#stage");
    pull = { results: res, index: 0, flipped: new Set(), done: false, opening: true };
    lastAdvance = 0;
    updateChrome();
    afterBooster();

    const stage = $("#stage"), pack = $("#pack");
    const n = res.length;
    $(".pk-tilt", pack).style.transform = "";
    $("#topLine").innerHTML = "&nbsp;";
    // Le bouton reste au même endroit : il sert maintenant à faire défiler les cartes
    const ui = $("#stackUi");
    if (ui) ui.outerHTML = stackUiHTML();
    $("#mainBtn").textContent = "Ouverture…";
    bindStack();

    // Les cartes sont glissées dans le paquet (cachées derrière le corps du booster)
    stage.insertAdjacentHTML("afterbegin", slotsHTML());
    const slots = $$("#stage .slot");
    slots.forEach((s, i) => {
      s.style.transition = "none";
      s.style.transform = "translateY(10%) scale(.82)";
      s.style.zIndex = 40 - i;
    });

    // Re-toucher pendant l'ouverture : on saute l'animation du booster et on arrive
    // directement sur la pile de cartes (les cartes, elles, se retournent normalement)
    let skipped = false;
    const skipOpening = () => {
      if (skipped || !pull || !pull.opening || id !== seq) return;
      skipped = true;
      seq++; // stoppe la suite de l'animation
      pack.remove();
      $(".pk-beam") && $(".pk-beam").remove();
      stage.style.transition = "none";
      stage.classList.remove("idle");
      slots.forEach((s) => { s.style.transition = "none"; s.style.transitionDelay = ""; s.classList.remove("aura", "rising"); });
      ignoreClickUntil = Date.now() + 450; // le clic qui a servi à passer l'animation ne fait rien d'autre
      $("#topLine").innerHTML = `Carte <b id="cnum">1</b> / ${n}`;
      pull.opening = false;
      layoutStack();
      void stage.offsetWidth; // applique la position finale sans transition
      slots.forEach((s) => (s.style.transition = ""));
      stage.style.transition = "";
      scheduleAutoFlip(0);
    };
    stage.closest(".booster-page").addEventListener("pointerdown", skipOpening);

    // 1. Déchirure du haut
    pack.classList.add("tearing");
    await wait(520); if (!alive()) return;
    pack.classList.add("torn");
    $(".pk-beam").classList.add("on");
    flash("#ffffff", 0.35);
    await wait(380); if (!alive()) return;

    // Tempo unique de l'ouverture : toutes les cartes bougent avec la même durée, la même courbe
    // et le même écart entre elles (montée puis rangement), pour un mouvement régulier.
    const BEAT = 100;                               // écart entre deux cartes (ms)
    const MOVE = 300;                               // durée du mouvement de chaque carte (ms)
    const EASE = "cubic-bezier(.45,0,.25,1)";       // même courbe pour tout
    const SPAN = (n - 1) * BEAT + MOVE;             // durée totale d'une vague (5 cartes)
    const moveT = `transform ${MOVE}ms ${EASE}, filter ${MOVE}ms ${EASE}, opacity ${MOVE}ms ${EASE}`;

    // 2. Le booster descend pendant que les cartes montent une à une (la meilleure — au fond — en premier)
    pack.style.transition = `transform ${SPAN}ms ${EASE}, opacity ${SPAN}ms ${EASE}`;
    pack.classList.add("drop");
    for (let i = n - 1; i >= 0; i--) {
      const s = slots[i];
      s.style.transition = moveT;
      s.style.transitionDelay = `${(n - 1 - i) * BEAT}ms`;
      s.classList.add("aura");
      s.style.transform = `translateY(${24 - i * 9.5}%)`; // sortie bien droite, sans inclinaison
    }
    await wait(SPAN + BEAT * 2); if (!alive()) return; // petite pause pour apercevoir les raretés

    // 3. Les cartes redescendent se ranger en pile, dans le même ordre et au même tempo ; le booster s'en va
    pack.classList.add("gone");
    $(".pk-beam").classList.remove("on");
    stage.style.transition = `margin-bottom ${SPAN}ms ${EASE}`;
    stage.classList.remove("idle");
    for (let i = n - 1; i >= 0; i--) {
      const d = (n - 1 - i) * BEAT;
      slots[i].style.transitionDelay = `${d}ms`;
      setTimeout(() => slots[i].classList.remove("aura"), d);
    }
    $("#topLine").innerHTML = `Carte <b id="cnum">1</b> / ${n}`;
    layoutStack();
    await wait(SPAN); if (!alive()) return;
    // Pile en place : on rend la main au joueur et la 1re carte se retourne
    slots.forEach((s) => { s.style.transition = ""; s.style.transitionDelay = ""; });
    stage.style.transition = "";
    pull.opening = false;
    scheduleAutoFlip(0);
    pack.remove();
    $(".pk-beam") && $(".pk-beam").remove();
  }

  /* ---------- Le paquet de cartes (après ouverture) ---------- */
  function renderStack() {
    const n = pull.results.length;
    app.innerHTML = `
    <section class="booster-page reveal">
      <p class="counter" id="topLine">Carte <b id="cnum">1</b> / ${n}</p>
      <div class="stage" id="stage">${slotsHTML()}</div>
      ${stackUiHTML()}
    </section>`;
    bindStack();
    layoutStack();
  }

  function bindStack() {
    const stage = $("#stage");
    let sx = null, sy = null;
    stage.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
    stage.addEventListener("pointerup", (e) => {
      if (sx == null || !pull || pull.opening) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      // Toucher la carte : la retourne si elle est de dos, sinon ouvre sa vue en grand.
      // Pour passer à la carte suivante : uniquement la flèche ou le bouton en dessous.
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) tapCard();
    });
    $("#prevBtn").addEventListener("click", back);
    $("#nextBtn").addEventListener("click", advance);
    $("#mainBtn").addEventListener("click", advance);
  }

  function layoutStack() {
    if (!$("#stage")) return;
    const { index, flipped, results } = pull;
    $$("#stage .slot").forEach((s) => {
      const i = +s.dataset.i;
      const k = i - index;
      s.classList.toggle("top", k === 0);
      if (!s.classList.contains("flipping")) s.classList.toggle("flipped", flipped.has(i));
      s.classList.toggle("gone", k < 0);
      s.style.zIndex = 50 - Math.abs(k);
      if (k < 0) {
        s.style.transform = `translateX(-135%) rotate(-16deg)`;
        s.style.opacity = 0;
      } else {
        const d = Math.min(k, 4);
        s.style.transform = `translateY(${d * 18}px) scale(${1 - d * 0.045}) rotate(${k === 0 ? 0 : (k % 2 ? 1 : -1) * (1 + d)}deg)`;
        s.style.opacity = k > 4 ? 0 : 1;
        s.style.filter = k === 0 ? "" : `brightness(${1 - d * 0.15})`;
      }
    });
    const cnum = $("#cnum");
    if (cnum) cnum.textContent = index + 1;
    $$(".dots i").forEach((d, i) => {
      d.classList.toggle("seen", flipped.has(i));
      d.classList.toggle("on", i === index);
    });
    $("#prevBtn").disabled = index === 0;
    $("#nextBtn").disabled = false;
    const remaining = results.length - 1 - index;
    const btn = $("#mainBtn");
    if (!flipped.has(index) && remaining === 0) btn.textContent = "Retourner la carte";
    else if (remaining > 0) btn.textContent = `Encore ${remaining} carte${remaining > 1 ? "s" : ""}`;
    else btn.textContent = "Voir mon booster";
  }

  let revealTimer = null;
  // La carte reste de dos un moment, puis se retourne toute seule (même animation qu'au toucher)
  function scheduleAutoFlip(i) {
    if (!C.retournementAuto) return;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      if (pull && !pull.done && !pull.opening && pull.index === i && !pull.flipped.has(i) && $("#stage")) flipCurrent();
    }, C.delaiRetournement ?? 1000);
  }

  // Retournement animé de la carte du dessus
  const FLIP_MS = 500;      // durée du retournement (doit correspondre à .flipping dans style.css)
  let flipTimers = [];
  function flipCurrent() {
    const i = pull.index;
    if (pull.flipped.has(i)) return;
    clearTimeout(revealTimer);
    pull.flipped.add(i);
    const slot = $(`#stage .slot[data-i="${i}"]`);
    if (slot) {
      slot.classList.add("flipping");
      flipTimers.push(setTimeout(() => { slot.classList.remove("flipping"); slot.classList.add("flipped"); }, FLIP_MS));
    }
    layoutStack();
    const card = pull.results[i].card;
    const ri = G.rarityIndex(card.rarete);
    const col = G.rarity(card.rarete).couleur;
    const fx = Math.round(FLIP_MS * 0.46);
    if (ri >= 2) flipTimers.push(setTimeout(() => burst(slot, col, ri), fx));
    if (ri >= 4) flipTimers.push(setTimeout(() => { flash(col, 0.55); document.body.classList.add("shake"); setTimeout(() => document.body.classList.remove("shake"), 500); }, fx));
  }

  // Retourne la carte du dessus instantanément (sans animation ni effets) — utilisé quand on enchaîne vite
  function revealInstant() {
    const i = pull.index;
    clearTimeout(revealTimer);
    flipTimers.forEach(clearTimeout); flipTimers = [];
    pull.flipped.add(i);
    const slot = $(`#stage .slot[data-i="${i}"]`);
    if (slot) {
      slot.classList.add("instant");
      slot.classList.remove("flipping");
      slot.classList.add("flipped");
      void slot.offsetWidth; // applique le retournement sans transition
      slot.classList.remove("instant");
    }
  }

  // Flèche / bouton : passe à la carte suivante.
  // Si la carte est encore de dos ou en train de se retourner, on la révèle d'un coup et on passe :
  // en spammant, on file directement jusqu'à la dernière carte.
  // Mode rapide : si le joueur passe à la suivante avant que la carte ait eu le temps de se retourner
  // toute seule (ou s'il enchaîne les clics), la carte suivante arrive directement face visible.
  let lastAdvance = 0, ignoreClickUntil = 0;
  function advance() {
    if (!pull || pull.done || pull.opening) return;
    if (Date.now() < ignoreClickUntil) return;
    const now = Date.now();
    const quick = now - lastAdvance < (C.delaiRetournement ?? 1000) + FLIP_MS;
    lastAdvance = now;
    const i = pull.index;
    const last = i >= pull.results.length - 1;
    const slot = $(`#stage .slot[data-i="${i}"]`);
    const busy = slot && slot.classList.contains("flipping");
    const fast = quick || !pull.flipped.has(i) || busy;
    if (!pull.flipped.has(i) || busy) {
      revealInstant();
      if (last) return layoutStack(); // la dernière carte : on la montre au lieu de quitter
    } else if (last) return finishPull();
    pull.index++;
    if (fast) {
      revealInstant(); // la nouvelle carte arrive déjà retournée
      layoutStack();
      const card = pull.results[pull.index].card, ri = G.rarityIndex(card.rarete);
      if (ri >= 2) burst($(`#stage .slot[data-i="${pull.index}"]`), G.rarity(card.rarete).couleur, ri);
    } else {
      layoutStack();
      scheduleAutoFlip(pull.index);
    }
  }
  // Toucher la carte du dessus : retourne-la, ou (déjà retournée) affiche sa fiche en grand
  function tapCard() {
    if (!pull || pull.done || pull.opening) return;
    const i = pull.index;
    const slot = $(`#stage .slot[data-i="${i}"]`);
    if (slot && slot.classList.contains("flipping")) return;
    if (!pull.flipped.has(i)) return flipCurrent();
    openCardModal(pull.results[i].card.id, null, { noFuse: true });
  }
  function back() {
    if (!pull || pull.done || pull.opening || pull.index === 0) return;
    clearTimeout(revealTimer);
    pull.index--;
    layoutStack();
  }

  function finishPull() {
    pull.done = true;
    renderRecap(true);
  }

  /* ---------- Récapitulatif du booster ---------- */
  function renderRecap(anim) {
    const left = G.boostersLeft();
    const nouveaux = pull.results.filter((x) => x.isNew).length;
    app.innerHTML = `
    <section class="booster-page">
      <h1 class="page-title">Ton booster</h1>
      <p class="muted">${nouveaux
        ? `<b>${nouveaux}</b> nouvelle${nouveaux > 1 ? "s" : ""} carte${nouveaux > 1 ? "s" : ""} ! Touche une carte pour la voir en grand.`
        : `Que des doublons… pense à la <a href="#fusion">fusion</a> !`}</p>
      <div class="recap ${anim ? "deal" : ""}">
        ${pull.results.map((x, i) => `<div class="recap-item" style="--d:${i * 0.07}s">${cardHTML(x.card, { isNew: x.isNew })}</div>`).join("")}
      </div>
      <div class="pull-actions">
        ${left > 0 ? `<button class="btn btn-primary" id="again"><i class="ico-pack" aria-hidden="true"></i>Booster suivant (${leftLabel(left)})</button>`
          : `<span class="muted">Prochain booster dans <b data-countdown>${clock(G.msUntilNext())}</b></span>`}
        <a class="btn" href="#collection">Voir ma collection</a>
      </div>
    </section>`;
    $$(".recap .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
    const again = $("#again");
    if (again) again.addEventListener("click", () => { pull = null; renderBooster(); openPack(); });
  }

  /* ---------- Effets spéciaux ---------- */
  function burst(slot, color, power) {
    if (!slot) return;
    const b = document.createElement("div");
    b.className = "burst";
    b.style.setProperty("--bc", color);
    const n = 10 + power * 6;
    for (let k = 0; k < n; k++) {
      const p = document.createElement("i");
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = 110 + Math.random() * 70 + power * 20;
      p.style.setProperty("--x", Math.cos(a) * d + "px");
      p.style.setProperty("--y", Math.sin(a) * d + "px");
      p.style.setProperty("--s", 4 + Math.random() * 7 + "px");
      b.appendChild(p);
    }
    b.appendChild(document.createElement("b"));
    slot.appendChild(b);
    setTimeout(() => b.remove(), 1300);
  }
  function flash(color, strength) {
    const f = document.createElement("div");
    f.className = "flash";
    f.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
    f.style.setProperty("--o", strength);
    $("#fx").appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  /* =========================================================
     PAGE : COLLECTION
     ========================================================= */
  const filters = { rarete: "all", owned: "all", tri: "rarete" };

  function renderCollection() {
    const total = BM.CARDS.length;
    const uniq = G.uniqueOwned();
    let list = BM.CARDS.filter((c) =>
      (filters.rarete === "all" || c.rarete === filters.rarete) &&
      (filters.owned === "all" || (filters.owned === "yes" ? G.owned(c.id) : !G.owned(c.id))));
    const sorters = {
      rarete: (a, b) => G.rarityIndex(b.rarete) - G.rarityIndex(a.rarete) || a.nom.localeCompare(b.nom),
      nom: (a, b) => a.nom.localeCompare(b.nom),
      nombre: (a, b) => G.copies(b.id) - G.copies(a.id) || a.nom.localeCompare(b.nom)
    };
    list = list.slice().sort(sorters[filters.tri]);

    const chip = (group, val, label, style = "") =>
      `<button class="chip ${filters[group] === val ? "on" : ""}" data-f="${group}" data-v="${esc(val)}" ${style}>${label}</button>`;

    app.innerHTML = `
    <section>
      <div class="coll-head">
        <h1 class="page-title">Ma collection</h1>
        <div class="coll-progress"><span><b>${uniq}</b> / ${total} cartes</span><div class="bar"><i style="width:${total ? (uniq / total) * 100 : 0}%"></i></div></div>
      </div>
      <div class="filters">
        <div class="chips">${chip("rarete", "all", "Toutes raretés")}${G.availableRarities().map((r) => chip("rarete", r.id, esc(r.nom), `style="--rc:${r.couleur}"`)).join("")}</div>
        <div class="chips">
          ${chip("owned", "all", "Toutes")}${chip("owned", "yes", "Obtenues")}${chip("owned", "no", "Manquantes")}
          <label class="sort">Trier :
            <select id="sortSel">
              <option value="rarete" ${filters.tri === "rarete" ? "selected" : ""}>Rareté</option>
              <option value="nom" ${filters.tri === "nom" ? "selected" : ""}>Nom</option>
              <option value="nombre" ${filters.tri === "nombre" ? "selected" : ""}>Exemplaires</option>
            </select>
          </label>
        </div>
      </div>
      ${list.length ? `<div class="grid">${list.map((c) => {
        const own = G.owned(c.id);
        return cardHTML(c, { missing: !own, count: G.copies(c.id), level: own ? G.bestLevel(c.id) : 1 });
      }).join("")}</div>` : `<div class="empty">Aucune carte ne correspond à ces filtres.</div>`}
    </section>`;

    $$(".chip[data-f]").forEach((b) => b.addEventListener("click", () => { filters[b.dataset.f] = b.dataset.v; renderCollection(); }));
    $("#sortSel").addEventListener("change", (e) => { filters.tri = e.target.value; renderCollection(); });
    $$(".grid .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
  }

  /* =========================================================
     PAGE : FUSION
     ========================================================= */
  function renderFusion() {
    const list = G.fusables();
    app.innerHTML = `
    <section>
      <h1 class="page-title">Fusion</h1>
      <div class="panel fusion-explain">
        <div class="fx-eq">
          <span class="mini"></span><span>+</span><span class="mini"></span><span>→</span><span class="mini up">★</span>
        </div>
        <p>Fusionne <b>2 exemplaires identiques</b> d'une carte (avec le même nombre d'étoiles) : la carte gagne <b>une étoile ★</b>.
        Chaque étoile donne +${Math.round(C.fusion.bonusParEtoile * 100)} % d'attaque et de défense, jusqu'à ${PER_COLOR()} étoiles dorées.
        Ensuite, fusionne 2 cartes ★★★ pour obtenir une <span class="stars-rainbow">★</span> <b>arc-en-ciel</b>, jusqu'à ${C.fusion.etoilesMax - PER_COLOR()} étoiles arc-en-ciel.</p>
      </div>
      ${list.length ? `<div class="grid fusion-grid">${list.map((x) => `
        <div class="fusion-item">
          ${cardHTML(x.card, { level: x.level, count: x.count })}
          <button class="btn btn-primary btn-sm" data-fuse="${esc(x.card.id)}" data-lv="${x.level}" title="Fusionner">⚗️ → ${stars(x.level + 1)}</button>
        </div>`).join("")}</div>
      <div class="fuse-all-bar"><button class="btn btn-primary btn-wide" id="fuseAll">⚗️ Tout fusionner</button>
        <p class="muted small">Fusionne d'un coup toutes les paires possibles, étoile après étoile, jusqu'à ce qu'il n'en reste plus.</p></div>`
        : `<div class="empty">Aucune fusion possible pour l'instant.<br>Il te faut 2 exemplaires d'une même carte avec le même nombre d'étoiles.<br><br><a class="btn btn-primary" href="#booster"><i class="ico-pack" aria-hidden="true"></i>Ouvrir un booster</a></div>`}
    </section>`;
    $$("[data-fuse]").forEach((b) => b.addEventListener("click", () => doFuse(b.dataset.fuse, +b.dataset.lv)));
    const fa = $("#fuseAll");
    if (fa) fa.addEventListener("click", () => doFuseAll(fa));
    $$(".fusion-item .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
  }

  let fusing = false;

  // Fusionne tout ce qui peut l'être, en cascade (2×★0 → ★1, puis 2×★1 → ★2, etc.)
  async function doFuseAll(btn) {
    if (fusing) return;
    fusing = true;
    if (btn) { btn.disabled = true; btn.textContent = "Fusion en cours…"; }
    const online = BM.Online.configured();
    const gained = new Set();
    let n = 0, error = null;
    const before = {};          // collection avant, pour montrer ce qui a changé
    BM.CARDS.forEach((c) => (before[c.id] = Object.assign({}, G.levels(c.id))));
    const refused = new Set(); // fusions refusées (ex. par le serveur) : on les saute et on continue avec les autres
    for (let guard = 0; guard < 1000; guard++) {
      const next = G.fusables().find((x) => !refused.has(x.card.id + ":" + x.level));
      if (!next) break;
      try {
        if (online) { await BM.Online.fuse(next.card.id, next.level); G.state.stats.fusions++; G.save(); }
        else if (!G.fuse(next.card.id, next.level)) throw new Error("Fusion impossible");
        n++;
        gained.add(next.card.id);
      } catch (e) {
        error = e;
        refused.add(next.card.id + ":" + next.level);
      }
    }
    fusing = false;
    if (online && n) BM.Online.pushStats(G.state.stats);
    if (n) {
      flash("#b06bff", 0.6);
      showFuseRecap(n, gained, before);
    }
    if (error) toast(`${refused.size} fusion${refused.size > 1 ? "s" : ""} refusée${refused.size > 1 ? "s" : ""} : ${esc(error.message)}`, "bad");
    else if (!n) toast("Fusion impossible", "bad");
    updateChrome();
    render();
  }
  // Aperçu après « Tout fusionner » : les cartes obtenues et leurs étoiles
  function showFuseRecap(n, gained, before) {
    const items = [];
    gained.forEach((id) => {
      const card = G.card(id), after = G.levels(id);
      Object.keys(after).map(Number).filter((l) => l > 1).forEach((l) => {
        const diff = (after[l] || 0) - ((before[id] || {})[l] || 0);
        if (diff > 0) items.push({ card, level: l, count: diff });
      });
    });
    items.sort((a, b) => b.level - a.level || G.rarityIndex(b.card.rarete) - G.rarityIndex(a.card.rarete) || a.card.nom.localeCompare(b.card.nom));
    BM.UI.openModal(`
      <div class="fuse-recap">
        <h2>⚗️ ${n} fusion${n > 1 ? "s" : ""} réalisée${n > 1 ? "s" : ""} !</h2>
        <p class="muted small">${items.length ? "Voici les cartes que tu as obtenues :" : "Tes cartes ont gagné des étoiles."}</p>
        <div class="grid recap-grid">${items.map((x) => `
          <div class="recap-cell">
            ${cardHTML(x.card, { level: x.level, count: x.count })}
            <p class="recap-label">${stars(x.level)}<br><small>${starsText(x.level)}${x.count > 1 ? ` · ×${x.count}` : ""}</small></p>
          </div>`).join("")}</div>
        <div class="row"><button class="btn btn-primary" data-close-recap>Super !</button></div>
      </div>`);
    $("[data-close-recap]").addEventListener("click", closeModal);
    $$(".recap-cell .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
  }

  async function doFuse(id, level) {
    const card = G.card(id);
    if (fusing) return;
    if (BM.Online.configured()) {
      if (!G.canFuse(id, level)) return toast("Fusion impossible", "bad");
      fusing = true;
      try { await BM.Online.fuse(id, level); G.state.stats.fusions++; G.save(); }
      catch (e) { fusing = false; return toast(esc(e.message), "bad"); }
      fusing = false;
      BM.Online.pushStats(G.state.stats);
    } else if (!G.fuse(id, level)) return toast("Fusion impossible", "bad");
    closeModal();
    const o = document.createElement("div");
    o.className = "fusion-anim";
    o.innerHTML = `
      <div class="fa-left">${cardHTML(card, { level })}</div>
      <div class="fa-right">${cardHTML(card, { level })}</div>
      <div class="fa-result">${cardHTML(card, { level: level + 1 })}<p>${stars(level + 1)} ${starsText(level + 1)} !</p></div>`;
    $("#fx").appendChild(o);
    setTimeout(() => flash(G.rarity(card.rarete).couleur, 0.8), 900);
    const end = () => { o.remove(); render(); };
    setTimeout(() => o.addEventListener("click", end, { once: true }), 1300);
    setTimeout(() => { if (o.isConnected) end(); }, 3200);
    updateChrome();
  }

  /* =========================================================
     PAGE : PROFIL
     ========================================================= */
  function renderProfil() {
    const st = G.state;
    const acc = st.account || {};
    const total = BM.CARDS.length;
    const uniq = G.uniqueOwned();
    const pct = total ? Math.round((uniq / total) * 100) : 0;
    const left = G.boostersLeft();
    const ms = G.msUntilNext();
    const ownedCards = BM.CARDS.filter((c) => G.owned(c.id));
    const maxLevel = ownedCards.reduce((m, c) => Math.max(m, G.bestLevel(c.id)), 0);
    const best = ownedCards
      .slice()
      .sort((a, b) => G.rarityIndex(b.rarete) - G.rarityIndex(a.rarete) || G.bestLevel(b.id) - G.bestLevel(a.id) || G.copies(b.id) - G.copies(a.id))
      .slice(0, 5);
    const since = new Date(acc.createdAt || st.createdAt || Date.now()).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    app.innerHTML = `
    <section class="profile">
      <div class="panel profile-head">
        <div class="avatar">${LOGO}</div>
        <div class="profile-id">
          <span class="muted small">Pseudo <span class="lock-tag">🔒 définitif</span></span>
          <h1 class="pseudo">${esc(acc.pseudo || "—")}${BM.Online.isOn() && BM.Online.me ? ` <button class="btn btn-sm friends-btn" data-friends="${BM.Online.me}" data-pseudo="${esc(acc.pseudo || "")}">👥 <span data-fcount>Amis</span></button>` : ""}</h1>
          <p class="muted small">Joueur depuis le ${since}${acc.id ? ` · <span class="acc-id">#${esc(acc.id.slice(0, 8))}</span>` : ""}</p>
        </div>
      </div>

      <div class="panel vitrine-panel">
        <div class="panel-head"><h2>Ma vitrine</h2><button class="btn btn-sm" id="editVitrine">✏️ Modifier</button></div>
        <p class="muted small">Tes ${C.vitrineMax} cartes préférées, visibles en premier par les autres joueurs.</p>
        ${vitrineHTML(G.vitrine().map((id) => ({ card: G.card(id), level: G.bestLevel(id) })), true)}
      </div>

      <div class="tiles">
        <div class="tile wide">
          <span class="tile-label">Collection</span>
          <span class="tile-value">${uniq} <small>/ ${total} · ${pct} %</small></span>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="tile"><span class="tile-label">Cartes possédées</span><span class="tile-value">${G.totalCopies()}</span></div>
        <div class="tile"><span class="tile-label">Boosters ouverts</span><span class="tile-value">${st.stats.boosters}</span></div>
        <div class="tile"><span class="tile-label">Fusions</span><span class="tile-value">${st.stats.fusions}</span></div>
        <div class="tile"><span class="tile-label">Max d'étoiles</span><span class="tile-value gold">${maxLevel > 1 ? stars(maxLevel) : "—"}</span></div>
        <div class="tile"><span class="tile-label">Boosters dispo</span><span class="tile-value">${leftLabel(left)} <small>${C.modeTest || G.unlimited() ? "" : "/ " + C.boostersMax}${ms > 0 ? ` · +1 dans <span data-countdown>${clock(ms)}</span>` : ""}</small></span></div>
      </div>

      <div class="panel">
        <h2>Progression par rareté</h2>
        <div class="rarity-list">
          ${G.availableRarities().map((r) => {
            const all = BM.CARDS.filter((c) => c.rarete === r.id);
            const got = all.filter((c) => G.owned(c.id)).length;
            return `
            <div class="rarity-row" style="--rc:${r.couleur}">
              <i class="gem"></i><b>${esc(r.nom)}</b>
              <div class="bar rbar"><i style="width:${all.length ? (got / all.length) * 100 : 0}%"></i></div>
              <span>${got} / ${all.length}</span>
            </div>`;
          }).join("")}
        </div>
      </div>

      <div class="panel">
        <h2>Mes meilleures cartes</h2>
        ${best.length ? `<div class="grid best">${best.map((c) => cardHTML(c, { level: G.bestLevel(c.id), count: G.copies(c.id) })).join("")}</div>`
          : `<p class="muted">Aucune carte pour l'instant. <a href="#booster">Ouvre ton premier booster !</a></p>`}
      </div>

      ${BM.Online.configured() ? `
      <div class="panel account-zone">
        <div><h2>Mon compte</h2><p class="muted small">Connecte-toi sur n'importe quel appareil avec ton pseudo et ton mot de passe.</p></div>
        <div class="account-actions">
          <button class="btn btn-sm" id="chgPwBtn">🔒 Changer de mot de passe</button>
          <button class="btn btn-sm" id="logoutBtn">Se déconnecter</button>
        </div>
      </div>` : `
      <div class="panel danger-zone">
        <div><h2>Supprimer mon compte</h2><p class="muted small">Efface ton compte, ta collection et tes statistiques sur ce navigateur.</p></div>
        <button class="btn btn-danger btn-sm" id="resetBtn">Supprimer</button>
      </div>`}
    </section>`;

    if (BM.Social) BM.Social.fillCounts();
    $$(".best .card, .vitrine .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
    $$(".vitrine .v-empty, #editVitrine").forEach((el) => el.addEventListener("click", openVitrinePicker));
    const rb = $("#resetBtn");
    if (rb) rb.addEventListener("click", confirmReset);
    const cp = $("#chgPwBtn"), lo = $("#logoutBtn");
    if (cp) cp.addEventListener("click", openChangePassword);
    if (lo) lo.addEventListener("click", confirmLogout);
  }

  /* ---------- Vitrine ---------- */
  // items = [{card, level}] ; editable = afficher des cases vides cliquables
  function vitrineHTML(items, editable) {
    const max = C.vitrineMax || 4;
    const slots = items.filter((x) => x.card).slice(0, max).map((x) => `<div class="v-slot">${cardHTML(x.card, { level: x.level })}</div>`);
    if (editable) while (slots.length < max) slots.push(`<button class="v-slot v-empty" aria-label="Ajouter une carte"><span>+</span></button>`);
    if (!slots.length) return `<p class="muted small">Aucune carte en vitrine.</p>`;
    return `<div class="vitrine">${slots.join("")}</div>`;
  }

  function openVitrinePicker() {
    const max = C.vitrineMax || 4;
    let sel = G.vitrine().slice();
    const owned = BM.CARDS.filter((c) => G.owned(c.id))
      .sort((a, b) => G.rarityIndex(b.rarete) - G.rarityIndex(a.rarete) || a.nom.localeCompare(b.nom));
    const draw = () => {
      $("#modalContent").innerHTML = `
        <div class="picker">
          <h2>Choisis ta vitrine</h2>
          <p class="muted small">Touche jusqu'à ${max} cartes. <b>${sel.length} / ${max}</b> sélectionnée${sel.length > 1 ? "s" : ""}.</p>
          ${owned.length ? `<div class="grid picker-grid">${owned.map((c) => {
            const k = sel.indexOf(c.id);
            return `<div class="pick ${k >= 0 ? "on" : ""}" data-id="${esc(c.id)}">${cardHTML(c, { level: G.bestLevel(c.id) })}${k >= 0 ? `<span class="pick-n">${k + 1}</span>` : ""}</div>`;
          }).join("")}</div>` : `<p class="muted">Tu n'as encore aucune carte.</p>`}
          <div class="row sticky-actions"><button class="btn" data-close-picker>Annuler</button><button class="btn btn-primary" id="saveVitrine">Enregistrer</button></div>
        </div>`;
      $$(".pick").forEach((el) => el.addEventListener("click", () => {
        const id = el.dataset.id, k = sel.indexOf(id);
        if (k >= 0) sel.splice(k, 1);
        else if (sel.length < max) sel.push(id);
        else toast(`${max} cartes maximum`, "bad");
        draw();
      }));
      $("[data-close-picker]").addEventListener("click", closeModal);
      $("#saveVitrine").addEventListener("click", async () => {
        G.setVitrine(sel);
        closeModal();
        render();
        try { await BM.Online.setVitrine(G.vitrine()); toast("Vitrine enregistrée"); }
        catch (e) { toast(esc(e.message), "bad"); }
      });
    };
    draw();
    $("#modal").hidden = false;
    document.body.classList.add("no-scroll");
  }

  function confirmReset() {
    $("#modalContent").innerHTML = `
      <div class="confirm">
        <h2>Supprimer ton compte ?</h2>
        <p class="muted">Ton pseudo, ta collection, tes fusions et tes statistiques seront supprimés de ce navigateur. Impossible d'annuler.</p>
        <div class="row"><button class="btn" data-no>Annuler</button><button class="btn btn-danger" data-yes>Oui, tout supprimer</button></div>
      </div>`;
    $("#modal").hidden = false;
    $("#modalContent [data-no]").addEventListener("click", closeModal);
    $("#modalContent [data-yes]").addEventListener("click", () => {
      G.reset(); pull = null; seq++; closeModal(); location.hash = "#booster"; render(); showOnboarding();
    });
  }

  /* =========================================================
     COMPTE : création (pseudo + mot de passe) ou connexion
     ========================================================= */
  function closeOnboarding(box, msg) {
    box.classList.add("out");
    document.body.classList.remove("no-scroll");
    setTimeout(() => box.remove(), 400);
    if (msg) toast(msg);
    render();
  }

  function showOnboarding(startTab) {
    if (G.hasAccount() || $("#onboard")) return;
    const online = BM.Online.configured();
    const box = document.createElement("div");
    box.className = "onboard";
    box.id = "onboard";
    document.body.appendChild(box);
    document.body.classList.add("no-scroll");
    const shake = (el) => { el.classList.add("shake-x"); setTimeout(() => el.classList.remove("shake-x"), 400); };
    const pwField = (id, label, auto) => `
      <label for="${id}">${label}</label>
      <div class="pw-wrap">
        <input id="${id}" type="password" maxlength="72" autocomplete="${auto}" placeholder="6 caractères minimum">
        <button type="button" class="pw-eye" data-eye="${id}" aria-label="Afficher le mot de passe">👁</button>
      </div>`;
    const bindEyes = () => $$("[data-eye]", box).forEach((b) => b.addEventListener("click", () => {
      const i = $("#" + b.dataset.eye); i.type = i.type === "password" ? "text" : "password";
    }));
    const tabs = (active) => online ? `
      <div class="ob-tabs">
        <button type="button" class="ob-tab ${active === "create" ? "on" : ""}" data-tab="create">Créer un compte</button>
        <button type="button" class="ob-tab ${active === "login" ? "on" : ""}" data-tab="login">J'ai déjà un compte</button>
      </div>` : "";
    const bindTabs = (vals) => $$("[data-tab]", box).forEach((b) => b.addEventListener("click", () =>
      b.dataset.tab === "login" ? login(vals()) : create(vals())));

    // ---------- Créer un compte ----------
    const create = (v = {}) => {
      box.innerHTML = `
        <form class="onboard-card" id="obForm" autocomplete="on">
          <div class="ob-logo">${LOGO}</div>
          <h1>Bienvenue dans <span>Bouffons Masters</span></h1>
          ${tabs("create")}
          <label for="obPseudo">Choisis ton pseudo</label>
          <input id="obPseudo" name="username" autocomplete="username" maxlength="${C.pseudo.max}" value="${esc(v.pseudo || "")}" placeholder="Ton pseudo" spellcheck="false" autocapitalize="off">
          <div class="ob-meta"><span></span><span id="obCount">0 / ${C.pseudo.max}</span></div>
          ${online ? pwField("obPw", "Choisis un mot de passe", "new-password") + pwField("obPw2", "Retape ton mot de passe", "new-password") : ""}
          <p class="ob-error" id="obErr"></p>
          <p class="ob-warn">⚠️ Ton pseudo est <b>définitif</b>.${online ? " Retiens bien ton mot de passe : il te servira à retrouver ton compte sur un autre appareil." : ""}</p>
          <button class="btn btn-primary btn-wide" type="submit">Créer mon compte</button>
        </form>`;
      const input = $("#obPseudo"), err = $("#obErr"), count = $("#obCount");
      const upd = () => { count.textContent = `${input.value.length} / ${C.pseudo.max}`; err.textContent = ""; };
      input.addEventListener("input", upd); upd();
      bindEyes();
      bindTabs(() => ({ pseudo: input.value }));
      setTimeout(() => input.focus(), 50);
      $("#obForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const vp = G.checkPseudo(input.value);
        if (!vp.ok) { err.textContent = vp.error; return shake(input); }
        let pw = "";
        if (online) {
          pw = $("#obPw").value;
          if (pw.length < 6) { err.textContent = "Le mot de passe doit faire au moins 6 caractères."; return shake($("#obPw")); }
          if (pw !== $("#obPw2").value) { err.textContent = "Les deux mots de passe ne sont pas identiques."; return shake($("#obPw2")); }
          const btn = $("#obForm button[type=submit]");
          btn.disabled = true; btn.textContent = "Vérification…";
          try {
            const taken = await BM.Online.findByPseudo(vp.pseudo);
            if (taken) throw new Error("Ce pseudo est déjà pris. Si c'est le tien, clique sur « J'ai déjà un compte ».");
          } catch (x) {
            btn.disabled = false; btn.textContent = "Créer mon compte";
            err.textContent = x.message; return;
          }
        }
        confirmCreate(vp.pseudo, pw);
      });
    };

    const confirmCreate = (pseudo, pw) => {
      box.innerHTML = `
        <div class="onboard-card">
          <div class="ob-logo">${LOGO}</div>
          <p class="muted">Ton pseudo sera</p>
          <p class="ob-pseudo">${esc(pseudo)}</p>
          <p class="ob-warn">Il est définitif. Tu confirmes ?</p>
          <p class="ob-error" id="obErr"></p>
          <div class="row">
            <button class="btn" id="obBack">Modifier</button>
            <button class="btn btn-primary" id="obOk">C'est parti !</button>
          </div>
        </div>`;
      $("#obBack").addEventListener("click", () => create({ pseudo }));
      $("#obOk").addEventListener("click", async () => {
        if (online) {
          const ok = $("#obOk");
          ok.disabled = true; ok.textContent = "Création…";
          try {
            const row = await BM.Online.signup(pseudo, pw);
            G.applyPlayer(row);
            await BM.Online.flush().catch(() => {});
          } catch (x) {
            create({ pseudo });
            $("#obErr").textContent = x.message;
            return;
          }
        } else if (!G.createAccount(pseudo)) return create({ pseudo });
        closeOnboarding(box, `Compte créé · bienvenue <b>${esc(pseudo)}</b> !`);
      });
    };

    // ---------- Se connecter ----------
    const login = (v = {}) => {
      box.innerHTML = `
        <form class="onboard-card" id="obForm" autocomplete="on">
          <div class="ob-logo">${LOGO}</div>
          <h1>Bon retour dans <span>Bouffons Masters</span></h1>
          ${tabs("login")}
          <label for="obPseudo">Ton pseudo</label>
          <input id="obPseudo" name="username" autocomplete="username" maxlength="${C.pseudo.max}" value="${esc(v.pseudo || "")}" placeholder="Ton pseudo" spellcheck="false" autocapitalize="off">
          ${pwField("obPw", "Ton mot de passe", "current-password")}
          <p class="ob-error" id="obErr"></p>
          <button class="btn btn-primary btn-wide" type="submit">Se connecter</button>
          <p class="muted small ob-hint">Tu as créé ton compte avant les mots de passe ? Ouvre le jeu sur ton appareil habituel : il te demandera d'en choisir un.</p>
        </form>`;
      const input = $("#obPseudo"), err = $("#obErr");
      bindEyes();
      bindTabs(() => ({ pseudo: input.value }));
      setTimeout(() => (input.value ? $("#obPw") : input).focus(), 50);
      $("#obForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!input.value.trim()) { err.textContent = "Entre ton pseudo."; return shake(input); }
        const btn = $("#obForm button[type=submit]");
        btn.disabled = true; btn.textContent = "Connexion…";
        try {
          const row = await BM.Online.login(input.value, $("#obPw").value);
          G.clearAccount();           // on oublie ce qui était sur ce navigateur
          G.applyPlayer(row);
          await BM.Online.refresh().catch(() => {});
          closeOnboarding(box, `Connecté · content de te revoir <b>${esc(row.pseudo)}</b> !`);
        } catch (x) {
          btn.disabled = false; btn.textContent = "Se connecter";
          err.textContent = x.message;
          shake($("#obPw"));
        }
      });
    };

    (online && startTab === "login") ? login() : create();
  }

  // Comptes créés avant les mots de passe : on demande d'en choisir un (obligatoire)
  function askPasswordIfMissing() {
    if (!BM.Online.isOn() || BM.Online.hasPassword || $("#onboard")) return;
    const box = document.createElement("div");
    box.className = "onboard";
    box.id = "onboard";
    document.body.appendChild(box);
    document.body.classList.add("no-scroll");
    box.innerHTML = `
      <form class="onboard-card" id="pwForm" autocomplete="on">
        <div class="ob-logo">${LOGO}</div>
        <h1>Protège ton compte</h1>
        <p class="muted">Nouveau : choisis un mot de passe. Avec ton pseudo <b>${esc((G.state.account || {}).pseudo || "")}</b>, il te permettra de retrouver ton compte sur n'importe quel navigateur, téléphone ou ordinateur.</p>
        <input type="text" name="username" autocomplete="username" value="${esc((G.state.account || {}).pseudo || "")}" hidden>
        <label for="newPw">Mot de passe</label>
        <div class="pw-wrap"><input id="newPw" type="password" maxlength="72" autocomplete="new-password" placeholder="6 caractères minimum"><button type="button" class="pw-eye" data-eye="newPw" aria-label="Afficher">👁</button></div>
        <label for="newPw2">Retape ton mot de passe</label>
        <div class="pw-wrap"><input id="newPw2" type="password" maxlength="72" autocomplete="new-password"><button type="button" class="pw-eye" data-eye="newPw2" aria-label="Afficher">👁</button></div>
        <p class="ob-error" id="pwErr"></p>
        <button class="btn btn-primary btn-wide" type="submit">Enregistrer mon mot de passe</button>
      </form>`;
    $$("[data-eye]", box).forEach((b) => b.addEventListener("click", () => { const i = $("#" + b.dataset.eye); i.type = i.type === "password" ? "text" : "password"; }));
    setTimeout(() => $("#newPw").focus(), 50);
    $("#pwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = $("#newPw").value, b = $("#newPw2").value, err = $("#pwErr");
      if (a.length < 6) return (err.textContent = "Le mot de passe doit faire au moins 6 caractères.");
      if (a !== b) return (err.textContent = "Les deux mots de passe ne sont pas identiques.");
      const btn = $("#pwForm button[type=submit]");
      btn.disabled = true; btn.textContent = "Enregistrement…";
      try { await BM.Online.setPassword(a); closeOnboarding(box, "Mot de passe enregistré 🔒"); }
      catch (x) { btn.disabled = false; btn.textContent = "Enregistrer mon mot de passe"; err.textContent = x.message; }
    });
  }

  // Profil : changer de mot de passe
  function openChangePassword() {
    BM.UI.openModal(`
      <form class="confirm pw-change" id="chgForm" autocomplete="on">
        <h2>Changer de mot de passe</h2>
        <input type="text" name="username" autocomplete="username" value="${esc((G.state.account || {}).pseudo || "")}" hidden>
        <label for="oldPw">Mot de passe actuel</label>
        <input id="oldPw" type="password" maxlength="72" autocomplete="current-password">
        <label for="nPw">Nouveau mot de passe</label>
        <input id="nPw" type="password" maxlength="72" autocomplete="new-password" placeholder="6 caractères minimum">
        <p class="ob-error" id="chgErr"></p>
        <div class="row"><button type="button" class="btn" data-no>Annuler</button><button class="btn btn-primary" type="submit">Enregistrer</button></div>
      </form>`);
    $("#modalContent [data-no]").addEventListener("click", closeModal);
    $("#chgForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = $("#nPw").value;
      if (n.length < 6) return ($("#chgErr").textContent = "Le mot de passe doit faire au moins 6 caractères.");
      try { await BM.Online.setPassword(n, $("#oldPw").value); closeModal(); toast("Mot de passe changé 🔒"); }
      catch (x) { $("#chgErr").textContent = x.message; }
    });
  }

  // Profil : se déconnecter de ce navigateur
  function confirmLogout() {
    BM.UI.openModal(`
      <div class="confirm">
        <h2>Se déconnecter ?</h2>
        <p class="muted">Ton compte et ta collection restent enregistrés. Pour revenir, il faudra ton pseudo et ton mot de passe.</p>
        <div class="row"><button class="btn" data-no>Annuler</button><button class="btn btn-danger" data-yes>Se déconnecter</button></div>
      </div>`);
    $("#modalContent [data-no]").addEventListener("click", closeModal);
    $("#modalContent [data-yes]").addEventListener("click", async () => {
      closeModal();
      await BM.Online.logout();
      G.clearAccount(); pull = null; seq++;
      location.hash = "#booster"; render();
      showOnboarding("login");
    });
  }

  /* =========================================================
     FICHE CARTE (fenêtre)
     ========================================================= */
  // other = { pseudo, levels } pour regarder la carte d'un autre joueur
  function openCardModal(id, other, opts = {}) {
    const card = G.card(id);
    if (!card) return;
    const levels = other ? other.levels || {} : G.levels(id);
    const lvs = Object.keys(levels).filter((k) => levels[k] > 0).map(Number);
    const own = lvs.length > 0;
    const copies = lvs.reduce((n, l) => n + levels[l], 0);
    const r = G.rarity(card.rarete);
    const lv = own ? Math.max(...lvs) : 1;
    const st = G.statsAt(card, lv);
    const base = G.statsAt(card, 1);
    const rate = G.dropRates()[card.rarete];
    const hidden = !own && !C.afficherNomCartesManquantes;

    $("#modalContent").innerHTML = `
    <div class="sheet">
      <div class="sheet-card">${cardHTML(card, { missing: !own, level: lv })}</div>
      <div class="sheet-info">
        <h2>${hidden ? "Carte mystère" : esc(card.nom)}</h2>
        <div class="badges">
          <span class="badge" style="--rc:${r.couleur}">${esc(r.nom)}</span>
          ${own && lv > 1 ? `<span class="badge gold">${stars(lv)}</span>` : ""}
        </div>
        ${other ? `<p class="muted small">Carte de <b>${esc(other.pseudo)}</b></p>` : ""}
        ${own ? "" : `<p class="desc muted">${other ? "Ce joueur n'a pas cette carte." : "Tu n'as pas encore cette carte. Ouvre des boosters pour la découvrir !"}</p>`}
        <dl class="facts">
          <div><dt>Taux de la rareté</dt><dd>${rate != null ? rate.toFixed(1) + " %" : "—"}</dd></div>
          ${st && own ? `<div><dt>Attaque</dt><dd>⚔ ${st.atk}${lv > 1 ? ` <small>(base ${base.atk})</small>` : ""}</dd></div>
          <div><dt>Défense</dt><dd>🛡 ${st.def}${lv > 1 ? ` <small>(base ${base.def})</small>` : ""}</dd></div>` : ""}
          <div><dt>Exemplaires</dt><dd>${copies}</dd></div>
        </dl>
        ${own ? `
        <div class="levels">
          ${Object.keys(levels).map(Number).sort((a, b) => a - b).map((l) => `
            <div class="level-row">
              <span class="lv">${starsLabel(l)}</span><b>×${levels[l]}</b>
              ${other || opts.noFuse ? "" : G.canFuse(id, l) ? `<button class="btn btn-primary btn-sm" data-fuse="${esc(id)}" data-lv="${l}">⚗️ Fusionner → ${stars(l + 1)}</button>`
                : l >= G.maxLevel() ? `<small class="muted">Max d'étoiles</small>` : `<small class="muted">encore ${2 - levels[l]} pour fusionner</small>`}
            </div>`).join("")}
        </div>` : ""}
      </div>
    </div>`;
    $$("#modalContent [data-fuse]").forEach((b) => b.addEventListener("click", () => doFuse(b.dataset.fuse, +b.dataset.lv)));
    $("#modal").hidden = false;
    document.body.classList.add("no-scroll");
  }
  function closeModal() {
    $("#modal").hidden = true;
    if (!$("#onboard")) document.body.classList.remove("no-scroll");
  }
  $$("#modal [data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return closeModal();
    if ($("#onboard") || !$("#modal").hidden || currentPage !== "booster") return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return; // un bouton a déjà son propre Espace/Entrée
    if (!pull && (e.key === " " || e.key === "Enter") && $("#pack.ready, #stage.ready #pack")) { e.preventDefault(); return openPack(); }
    if (!pull || pull.done || pull.opening) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") { e.preventDefault(); advance(); }
    if (e.key === "ArrowLeft") back();
  });

  /* ================= Navigation ================= */
  const pages = { booster: renderBooster, collection: renderCollection, fusion: renderFusion, profil: renderProfil };
  const prefixPages = {}; // "joueur-" → fonction(id)
  let currentPage = "booster";

  function render() {
    const p = decodeURIComponent((location.hash || "#booster").slice(1));
    const pre = Object.keys(prefixPages).find((k) => p.startsWith(k));
    if (pre) { currentPage = p; prefixPages[pre](p.slice(pre.length)); }
    else { currentPage = pages[p] ? p : "booster"; pages[currentPage](); }
    updateChrome();
  }

  // Après chaque booster : envoi au serveur + statistiques
  function afterBooster() {
    if (!BM.Online.configured()) return;
    BM.Online.pushStats(G.state.stats);
  }

  // Outils partagés avec social.js
  BM.UI = {
    $, $$, esc, cardHTML, toast, stars, vitrineHTML, openCardModal, closeModal, render, updateChrome,
    page(name, fn) { pages[name] = fn; },
    prefixPage(prefix, fn) { prefixPages[prefix] = fn; },
    openModal(html) { $("#modalContent").innerHTML = html; $("#modal").hidden = false; document.body.classList.add("no-scroll"); },
    get app() { return app; },
    get currentPage() { return currentPage; }
  };
  window.addEventListener("hashchange", () => {
    closeModal();
    seq++; // stoppe une animation d'ouverture en cours
    if (pull && pull.opening) pull.opening = false;
    if (pull && pull.done) pull = null;
    render();
    window.scrollTo(0, 0);
  });

  // Toutes les 20 s : relit le compte sur le serveur (échanges acceptés par un ami…)
  let lastSync = "";
  async function syncNow(force) {
    if (!BM.Online.isOn() || document.hidden) return;
    try {
      await BM.Online.refresh();
      const sig = JSON.stringify([G.state.collection, G.state.vitrine, BM.Online.incoming]);
      const changed = sig !== lastSync;
      lastSync = sig;
      updateChrome();
      if ((changed || force) && $("#modal").hidden && ["collection", "fusion", "profil", "social"].includes(currentPage)) render();
    } catch (e) { /* hors ligne : on réessaiera */ }
  }
  setInterval(syncNow, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
  BM.UI.sync = syncNow;

  // Chaque seconde : comptes à rebours + recharge des boosters
  let lastLeft = null;
  setInterval(() => {
    const ms = G.msUntilNext();
    $$("[data-countdown]").forEach((el) => (el.textContent = clock(ms)));
    const left = G.boostersLeft();
    updateChrome();
    if (lastLeft !== null && left !== lastLeft && currentPage === "booster" && !pull) render();
    lastLeft = left;
  }, 1000);

  /* ================= Démarrage ================= */
  $$("[data-logo]").forEach((el) => (el.innerHTML = LOGO));
  const errors = G.validate();
  if (errors.length) {
    const box = $("#errors");
    box.hidden = false;
    box.innerHTML = `<b>⚠️ Problème dans cards.js ou config.js :</b><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
  }
  G.load();
  document.addEventListener("DOMContentLoaded", async () => {
    render();
    if (!BM.Online.configured()) return showOnboarding();
    document.body.classList.add("connecting");
    const st = await BM.Online.init();
    document.body.classList.remove("connecting");
    if (st === "online") {
      if (BM.Online.player) {
        G.applyPlayer(BM.Online.player);
        await BM.Online.flush().catch(() => {});
        await BM.Online.refresh().catch(() => {});
        lastSync = JSON.stringify([G.state.collection, G.state.vitrine, BM.Online.incoming]);
      } else {
        G.clearAccount();
      }
    } else if (st === "offline") {
      toast("Serveur injoignable : mode hors ligne pour l'instant.", "bad");
    }
    render();
    showOnboarding();
    askPasswordIfMissing();
  });
})();
