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
  const stars = (level) => "★".repeat(G.starsOf(level));
  const starsLabel = (level) => (level <= 1 ? "Sans étoile" : `${stars(level)} <small>(${G.starsOf(level)} étoile${G.starsOf(level) > 1 ? "s" : ""})</small>`);
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
        <div class="card-art">${imgHTML(card)}${lvl > 1 && !o.missing ? `<span class="card-stars">${stars(lvl)}</span>` : ""}</div>
        ${o.big && !o.missing ? `<p class="card-desc">${esc(card.description)}</p>` : ""}
        <div class="card-foot">
          <span class="card-rarity">${esc(r.nom)}</span>
          ${st && !o.missing ? `<span class="card-stats"><b title="Attaque">⚔ ${st.atk}</b><b title="Défense">🛡 ${st.def}</b></span>` : ""}
        </div>
      </div>
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
        <div class="pf-rays"></div>
        <div class="pf-crimp pf-crimp-top"></div>
        <div class="pf-art">${LOGO}</div>
        <div class="pf-title"><span>BOUFFONS</span><b>MASTERS</b></div>
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

  function stackUiHTML() {
    return `
      <div class="stack-ui" id="stackUi">
        <div class="stack-nav">
          <button class="round-btn" id="prevBtn" aria-label="Carte précédente">‹</button>
          <div class="dots">${pull.results.map((_, i) => `<i data-dot="${i}"></i>`).join("")}</div>
          <button class="round-btn" id="nextBtn" aria-label="Carte suivante">›</button>
        </div>
        <button class="btn btn-primary btn-wide" id="mainBtn"></button>
        <p class="muted small hint-text">${C.retournementAuto ? "Touche la carte pour la voir en grand · flèche ou bouton pour passer à la suivante" : "Touche la carte pour la retourner, puis pour la voir en grand · flèche ou bouton pour passer à la suivante"}</p>
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
      <div class="stage idle" id="stage">${packHTML(locked)}</div>
      <p class="muted small pack-hint" id="packHint">${locked
        ? `Un nouveau booster toutes les ${C.rechargeMinutes} minute${C.rechargeMinutes > 1 ? "s" : ""}${G.unlimited() ? "" : ` (jusqu'à ${C.boostersMax} en réserve)`}.`
        : "Touche le booster pour le déchirer"}</p>
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
    pack.addEventListener("click", () => openPack(), { once: true });
  }

  /* ---------- Ouverture : déchirure → cartes qui sortent → pile ---------- */
  async function openPack() {
    const res = G.openBooster();
    if (!res) return renderBooster();
    const id = ++seq;
    const alive = () => id === seq && $("#stage");
    pull = { results: res, index: 0, flipped: new Set(), done: false, opening: true };
    updateChrome();
    afterBooster();

    const stage = $("#stage"), pack = $("#pack");
    const n = res.length;
    $(".pk-tilt", pack).style.transform = "";
    $("#topLine").innerHTML = "&nbsp;";
    $("#packHint").textContent = "";

    // Les cartes sont glissées dans le paquet (cachées derrière le corps du booster)
    stage.insertAdjacentHTML("afterbegin", slotsHTML());
    const slots = $$("#stage .slot");
    slots.forEach((s, i) => {
      s.style.transition = "none";
      s.style.transform = "translateY(10%) scale(.82)";
      s.style.zIndex = 40 - i;
    });

    // 1. Déchirure du haut
    pack.classList.add("tearing");
    await wait(520); if (!alive()) return;
    pack.classList.add("torn");
    $(".pk-beam").classList.add("on");
    flash("#ffffff", 0.35);
    await wait(380); if (!alive()) return;

    // 2. Le booster descend, les cartes montent (la meilleure — au fond — en premier)
    pack.classList.add("drop");
    slots.forEach((s) => (s.style.transition = ""));
    const rise = 35; // écart entre chaque carte (ms) — rapide pour un simple aperçu des raretés
    for (let i = n - 1; i >= 0; i--) {
      const s = slots[i];
      const delay = (n - 1 - i) * rise;
      setTimeout(() => {
        if (!alive()) return;
        s.classList.add("aura", "rising");
        s.style.transform = `translateY(${24 - i * 9.5}%)`; // sortie bien droite, sans inclinaison
      }, delay);
    }
    await wait((n - 1) * rise + 420); if (!alive()) return;

    // 3. Le booster s'en va, les cartes se rangent en pile (les auras s'éteignent)
    pack.classList.add("gone");
    $(".pk-beam").classList.remove("on");
    stage.classList.remove("idle");
    slots.forEach((s) => s.classList.remove("aura", "rising"));
    pull.opening = false;
    stage.insertAdjacentHTML("afterend", stackUiHTML());
    $("#topLine").innerHTML = `Carte <b id="cnum">1</b> / ${n}`;
    bindStack();
    layoutStack();
    scheduleAutoFlip(0);
    await wait(700); if (!alive()) return;
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
    $("#nextBtn").disabled = !flipped.has(index);
    const remaining = results.length - 1 - index;
    const btn = $("#mainBtn");
    if (!flipped.has(index)) btn.textContent = "Retourner la carte";
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
  function flipCurrent() {
    const i = pull.index;
    if (pull.flipped.has(i)) return;
    clearTimeout(revealTimer);
    pull.flipped.add(i);
    const slot = $(`#stage .slot[data-i="${i}"]`);
    if (slot) {
      slot.classList.add("flipping");
      setTimeout(() => { slot.classList.remove("flipping"); slot.classList.add("flipped"); }, 900);
    }
    layoutStack();
    const card = pull.results[i].card;
    const ri = G.rarityIndex(card.rarete);
    const col = G.rarity(card.rarete).couleur;
    if (ri >= 2) setTimeout(() => burst(slot, col, ri), 420);
    if (ri >= 4) setTimeout(() => { flash(col, 0.55); document.body.classList.add("shake"); setTimeout(() => document.body.classList.remove("shake"), 500); }, 420);
  }

  // Toucher : retourne la carte, ou (si déjà retournée) l'envoie et passe à la suivante
  function advance() {
    if (!pull || pull.done || pull.opening) return;
    const i = pull.index;
    const slot = $(`#stage .slot[data-i="${i}"]`);
    if (slot && slot.classList.contains("flipping")) return; // on laisse finir l'animation
    if (!pull.flipped.has(i)) return flipCurrent();
    if (i >= pull.results.length - 1) return finishPull();
    pull.index++;
    layoutStack();
    scheduleAutoFlip(pull.index);
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
        ${left > 0 ? `<button class="btn btn-primary" id="again">🎁 Booster suivant (${leftLabel(left)})</button>`
          : `<span class="muted">Prochain booster dans <b data-countdown>${clock(G.msUntilNext())}</b></span>`}
        <a class="btn" href="#collection">Voir ma collection</a>
      </div>
    </section>`;
    $$(".recap .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
    const again = $("#again");
    if (again) again.addEventListener("click", () => { pull = null; renderBooster(); });
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
        <div class="chips">${chip("rarete", "all", "Toutes raretés")}${C.raretes.map((r) => chip("rarete", r.id, esc(r.nom), `style="--rc:${r.couleur}"`)).join("")}</div>
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
        Chaque étoile donne +${Math.round(C.fusion.bonusParEtoile * 100)} % d'attaque et de défense, jusqu'à ${C.fusion.etoilesMax} étoiles.</p>
      </div>
      ${list.length ? `<div class="grid fusion-grid">${list.map((x) => `
        <div class="fusion-item">
          ${cardHTML(x.card, { level: x.level, count: x.count })}
          <button class="btn btn-primary btn-sm" data-fuse="${esc(x.card.id)}" data-lv="${x.level}" title="Fusionner">⚗️ → ${stars(x.level + 1)}</button>
        </div>`).join("")}</div>`
        : `<div class="empty">Aucune fusion possible pour l'instant.<br>Il te faut 2 exemplaires d'une même carte avec le même nombre d'étoiles.<br><br><a class="btn btn-primary" href="#booster">🎁 Ouvrir un booster</a></div>`}
    </section>`;
    $$("[data-fuse]").forEach((b) => b.addEventListener("click", () => doFuse(b.dataset.fuse, +b.dataset.lv)));
    $$(".fusion-item .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
  }

  let fusing = false;
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
    const ns = G.starsOf(level + 1);
    o.innerHTML = `
      <div class="fa-left">${cardHTML(card, { level })}</div>
      <div class="fa-right">${cardHTML(card, { level })}</div>
      <div class="fa-result">${cardHTML(card, { level: level + 1 })}<p>${stars(level + 1)} ${ns} étoile${ns > 1 ? "s" : ""} !</p></div>`;
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
          <h1 class="pseudo">${esc(acc.pseudo || "—")}</h1>
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
          ${C.raretes.map((r) => {
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

      ${BM.Online.configured() ? `<p class="muted small center">Compte en ligne · ton pseudo et ta collection sont enregistrés sur le serveur.</p>` : `
      <div class="panel danger-zone">
        <div><h2>Supprimer mon compte</h2><p class="muted small">Efface ton compte, ta collection et tes statistiques sur ce navigateur.</p></div>
        <button class="btn btn-danger btn-sm" id="resetBtn">Supprimer</button>
      </div>`}
    </section>`;

    $$(".best .card, .vitrine .card").forEach((el) => el.addEventListener("click", () => openCardModal(el.dataset.card)));
    $$(".vitrine .v-empty, #editVitrine").forEach((el) => el.addEventListener("click", openVitrinePicker));
    const rb = $("#resetBtn");
    if (rb) rb.addEventListener("click", confirmReset);
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
     CRÉATION DE COMPTE (premier lancement)
     ========================================================= */
  function showOnboarding() {
    if (G.hasAccount() || $("#onboard")) return;
    const box = document.createElement("div");
    box.className = "onboard";
    box.id = "onboard";
    document.body.appendChild(box);
    document.body.classList.add("no-scroll");

    const step1 = (value = "") => {
      box.innerHTML = `
        <form class="onboard-card" id="obForm" autocomplete="off">
          <div class="ob-logo">${LOGO}</div>
          <h1>Bienvenue dans <span>Bouffons Masters</span></h1>
          <p class="muted">Crée ton compte pour commencer ta collection.</p>
          <label for="obPseudo">Choisis ton pseudo</label>
          <input id="obPseudo" maxlength="${C.pseudo.max}" value="${esc(value)}" placeholder="Ton pseudo" spellcheck="false" autocapitalize="off">
          <div class="ob-meta"><span class="ob-error" id="obErr"></span><span id="obCount">0 / ${C.pseudo.max}</span></div>
          <p class="ob-warn">⚠️ Ton pseudo est <b>définitif</b> : tu ne pourras pas le changer ensuite.</p>
          <button class="btn btn-primary btn-wide" type="submit">Créer mon compte</button>
        </form>`;
      const input = $("#obPseudo"), err = $("#obErr"), count = $("#obCount");
      const upd = () => { count.textContent = `${input.value.length} / ${C.pseudo.max}`; err.textContent = ""; };
      input.addEventListener("input", upd); upd();
      setTimeout(() => input.focus(), 50);
      $("#obForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = G.checkPseudo(input.value);
        if (!v.ok) { err.textContent = v.error; input.classList.add("shake-x"); setTimeout(() => input.classList.remove("shake-x"), 400); return; }
        if (BM.Online.configured()) {
          const btn = $("#obForm button[type=submit]");
          btn.disabled = true; btn.textContent = "Vérification…";
          try {
            const taken = await BM.Online.findByPseudo(v.pseudo);
            if (taken) throw new Error("Ce pseudo est déjà pris, choisis-en un autre.");
          } catch (x) {
            btn.disabled = false; btn.textContent = "Créer mon compte";
            err.textContent = x.message; return;
          }
        }
        step2(v.pseudo);
      });
    };

    const step2 = (pseudo) => {
      box.innerHTML = `
        <div class="onboard-card">
          <div class="ob-logo">${LOGO}</div>
          <p class="muted">Ton pseudo sera</p>
          <p class="ob-pseudo">${esc(pseudo)}</p>
          <p class="ob-warn">Il est définitif. Tu confirmes ?</p>
          <div class="row">
            <button class="btn" id="obBack">Modifier</button>
            <button class="btn btn-primary" id="obOk">C'est parti !</button>
          </div>
        </div>`;
      $("#obBack").addEventListener("click", () => step1(pseudo));
      $("#obOk").addEventListener("click", async () => {
        if (BM.Online.configured()) {
          const ok = $("#obOk");
          ok.disabled = true; ok.textContent = "Création…";
          try {
            const row = await BM.Online.signup(pseudo);
            G.applyPlayer(row);
            await BM.Online.flush().catch(() => {});
          } catch (x) {
            step1(pseudo);
            $("#obErr").textContent = x.message;
            return;
          }
        } else if (!G.createAccount(pseudo)) return step1(pseudo);
        box.classList.add("out");
        document.body.classList.remove("no-scroll");
        setTimeout(() => box.remove(), 400);
        toast(`Compte créé · bienvenue <b>${esc(pseudo)}</b> !`);
        render();
      });
    };
    step1();
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
        ${own ? `<p class="desc">${esc(card.description)}</p>` : `<p class="desc muted">${other ? "Ce joueur n'a pas cette carte." : "Tu n'as pas encore cette carte. Ouvre des boosters pour la découvrir !"}</p>`}
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
    if ($("#onboard") || !$("#modal").hidden || currentPage !== "booster" || !pull || pull.done || pull.opening) return;
    if (e.target.tagName === "INPUT") return;
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
    BM.Online.flush().catch(() => toast("Cartes gardées en attente : connexion au serveur impossible.", "bad"));
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
  });
})();
