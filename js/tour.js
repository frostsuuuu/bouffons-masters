/* =========================================================
   MINI-JEU « TOUR INFERNALE »
   - Tu choisis 5 cartes de ta collection (à leur meilleur niveau de fusion).
   - Elles affrontent, une par une, toutes les cartes du jeu, de la plus faible
     à la plus forte (une carte = un étage de la tour).
   - Combat automatique : 100 PV chacune, coups chacun son tour.
   - Une carte ennemie tuée → l'étage suivant. Ta carte tuée → ta carte suivante.
     Tes cartes gardent leurs PV d'un combat à l'autre.
   - Pour l'instant pas de récompense : on garde juste ton record.
   ========================================================= */
(function () {
  const G = BM.Game;
  const { $, $$, esc, cardHTML, toast } = BM.UI;
  const app = () => BM.UI.app;

  const TEAM = 5;
  const HP = 100;
  // Dégâts d'un coup : r = attaque / (attaque + défense de la cible), dégâts = 80 × r², ±15 % au hasard.
  //   à stats égales (r = 0,5) : 20 dégâts → 5 coups pour tuer
  //   plus d'attaque → plus de dégâts ; plus de défense en face → moins de dégâts.
  //   Le carré rend les écarts de force bien visibles (une Légendaire écrase une Commune).
  //   10 % de chances de coup critique (× 1,5). Toujours au moins 1 dégât.
  const BASE = 80, SPREAD = 0.15, CRIT = 0.1, CRIT_X = 1.5;
  function hit(atk, def) {
    const crit = Math.random() < CRIT;
    const r = atk / Math.max(1, atk + def);
    const raw = BASE * r * r * (1 - SPREAD + Math.random() * SPREAD * 2) * (crit ? CRIT_X : 1);
    return { dmg: Math.max(1, Math.round(raw)), crit };
  }

  const KEY_TEAM = "bm_tour_team", KEY_BEST = "bm_tour_best";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const stat = (c, lv) => G.statsAt(c, lv) || { atk: 0, def: 0 };
  const power = (c, lv) => { const s = stat(c, lv); return s.atk + s.def; };
  // La tour (80 étages) :
  //  1. toutes les cartes du jeu, sans étoile, de la plus faible à la plus forte ;
  //  2. puis les étages « étoilés » : les mêmes cartes avec des étoiles de fusion, de plus en plus fortes,
  //     toujours plus fortes que la meilleure carte sans étoile (donc jamais une Commune étoilée).
  //     Le dernier étage = la carte la plus forte du jeu avec toutes ses étoiles.
  const FLOORS = 80;
  const MAX_LV = () => (BM.CONFIG.fusion.etoilesMax || 6) + 1;
  let towerCache = null;
  function floors() {
    if (towerCache && towerCache.n === BM.CARDS.length) return towerCache.list;
    const base = BM.CARDS.filter((c) => G.statsAt(c, 1)).slice()
      .sort((a, b) => power(a, 1) - power(b, 1) || a.nom.localeCompare(b.nom)).map((c) => ({ card: c, level: 1 }));
    const list = base.slice();
    const extra = FLOORS - base.length;
    if (extra > 0 && base.length) {
      const top = power(base[base.length - 1].card, 1);
      const cand = [];
      base.forEach(({ card }) => { for (let lv = 2; lv <= MAX_LV(); lv++) if (power(card, lv) > top) cand.push({ card, level: lv }); });
      cand.sort((a, b) => power(a.card, a.level) - power(b.card, b.level));
      const used = new Set();
      for (let i = 0; i < extra && cand.length; i++) {
        let k = Math.round(i * (cand.length - 1) / Math.max(1, extra - 1));
        while (used.has(k) && k < cand.length - 1) k++;
        used.add(k);
        list.push(cand[k]);
      }
    }
    towerCache = { n: BM.CARDS.length, list };
    return list;
  }
  const mine = () => BM.CARDS.filter((c) => G.owned(c.id) && G.statsAt(c, 1))
    .map((c) => ({ card: c, level: G.bestLevel(c.id) }))
    .sort((a, b) => power(b.card, b.level) - power(a.card, a.level));

  let team = load(KEY_TEAM, []);  // ids dans l'ordre de passage
  let run = null;                 // combat en cours
  let lastRun = null;             // dernier combat (pour l'afficher derrière la fenêtre de fin)
  window.addEventListener("hashchange", () => { if (run) run.alive = false; run = null; });

  /* =========================================================
     PAGE 1 : choix de l'équipe
     ========================================================= */
  function renderPick() {
    const list = mine();
    const byId = Object.fromEntries(list.map((x) => [x.card.id, x]));
    team = team.filter((id) => byId[id]).slice(0, TEAM);
    const best = load(KEY_BEST, 0), total = floors().length;
    app().innerHTML = `
    <section class="tour-pick">
      <div class="qe-head"><a class="btn btn-sm" href="#minijeux">‹ Mini-jeux</a><h1 class="page-title">Tour Infernale</h1></div>
      <p class="muted">Tes 5 cartes affrontent toutes les cartes du jeu, une par une, de la plus faible à la plus forte. Le combat est automatique : chaque carte a ${HP} PV, l'attaque fait mal, la défense protège. Tes cartes gardent leurs PV d'un combat à l'autre.</p>
      <div class="tour-bar">
        <span class="mm-stat"><span>Étages</span><b>${total}</b></span>
        <span class="muted small">Après l'étage ${BM.CARDS.filter((c) => G.statsAt(c, 1)).length}, les cartes reviennent avec des étoiles ★</span>
        <span class="mm-stat"><span>Ton record</span><b>${best ? `Étage ${best}` : "—"}</b></span>
        <span class="muted small">🎁 Récompenses selon l'étage atteint : bientôt !</span>
      </div>
      <div class="panel">
        <h2>Ton équipe <span class="muted small">(dans l'ordre de passage)</span></h2>
        <div class="tour-team">${Array.from({ length: TEAM }, (_, i) => {
          const x = byId[team[i]];
          return `<div class="tour-slot ${x ? "full" : ""}" data-slot="${i}"><span class="tour-num">${i + 1}</span>${x ? cardHTML(x.card, { level: x.level }) : `<span class="tour-empty">Carte ${i + 1}</span>`}</div>`;
        }).join("")}</div>
        <div class="pull-actions">
          <button class="btn" id="tourAuto">✨ Mes 5 meilleures</button>
          <button class="btn" id="tourClear" ${team.length ? "" : "disabled"}>Vider</button>
          <button class="btn btn-primary" id="tourGo" ${team.length ? "" : "disabled"}>🗼 Monter dans la tour${team.length && team.length < TEAM ? ` (${team.length} carte${team.length > 1 ? "s" : ""})` : ""}</button>
        </div>
      </div>
      <h2>Ta collection <span class="muted small">— touche une carte pour l'ajouter ou la retirer</span></h2>
      ${list.length ? `<div class="grid tour-grid">${list.map((x) => {
        const i = team.indexOf(x.card.id);
        return `<div class="tour-opt ${i >= 0 ? "on" : ""}" data-id="${esc(x.card.id)}">${i >= 0 ? `<span class="tour-num">${i + 1}</span>` : ""}${cardHTML(x.card, { level: x.level })}</div>`;
      }).join("")}</div>` : `<div class="empty">Ouvre des boosters pour avoir des cartes !</div>`}
    </section>`;
    $$(".tour-opt").forEach((el) => el.addEventListener("click", () => {
      const id = el.dataset.id, i = team.indexOf(id);
      if (i >= 0) team.splice(i, 1);
      else if (team.length >= TEAM) return toast("Ton équipe est complète (5 cartes). Retire une carte d'abord.", "bad");
      else team.push(id);
      store(KEY_TEAM, team); renderPick();
    }));
    $$(".tour-slot.full").forEach((el) => el.addEventListener("click", () => { team.splice(+el.dataset.slot, 1); store(KEY_TEAM, team); renderPick(); }));
    $("#tourAuto").addEventListener("click", () => { team = list.slice(0, TEAM).map((x) => x.card.id); store(KEY_TEAM, team); renderPick(); });
    $("#tourClear").addEventListener("click", () => { team = []; store(KEY_TEAM, team); renderPick(); });
    $("#tourGo").addEventListener("click", () => start(team.map((id) => byId[id])));
  }

  /* =========================================================
     PAGE 2 : le combat
     ========================================================= */
  const fighter = (card, level) => ({ card, level, ...stat(card, level), hp: HP });
  let speed = load("bm_tour_speed", 1);

  function start(picked) {
    const tower = floors();
    run = {
      alive: true, skip: false,
      mine: picked.map((x) => fighter(x.card, x.level)), cur: 0,
      tower, floor: 0, foe: fighter(tower[0].card, tower[0].level), kills: 0
    };
    lastRun = run;
    drawBattle();
    loop(run);
  }

  function hpBar(f, side) {
    const p = Math.max(0, f.hp) / HP * 100;
    return `<div class="tour-hp ${side}"><i style="width:${p}%" class="${p <= 25 ? "low" : p <= 50 ? "mid" : ""}"></i><b>${Math.max(0, f.hp)} / ${HP} PV</b></div>`;
  }

  function drawBattle() {
    const r = run, me = r.mine[r.cur], foe = r.foe;
    const next = r.tower[r.floor + 1];
    app().innerHTML = `
    <section class="tour-fight">
      <div class="tour-top">
        <button class="btn btn-sm" id="tourQuit">‹ Quitter</button>
        <div class="tour-floor ${r.tower[r.floor].level > 1 ? "starred" : ""}"><span>Étage</span><b id="tourFloor">${r.floor + 1}</b><span>/ ${r.tower.length}</span></div>
        <div class="tour-speed">${[1, 2, 4].map((s) => `<button class="btn btn-sm ${s === speed ? "on" : ""}" data-speed="${s}">×${s}</button>`).join("")}<button class="btn btn-sm" id="tourSkip">⏭ Passer</button></div>
      </div>
      <div class="tour-arena">
        <div class="tour-side me">
          <div class="tour-label">Ta carte <b>${r.cur + 1}/${r.mine.length}</b></div>
          <div class="tour-card" id="tcMe">${cardHTML(me.card, { level: me.level, big: true })}</div>
          <div id="hpMe">${hpBar(me, "me")}</div>
        </div>
        <div class="tour-vs">VS</div>
        <div class="tour-side foe">
          <div class="tour-label">Étage ${r.floor + 1}${next ? ` <span class="muted">· ensuite : ${esc(next.card.nom)}${next.level > 1 ? " ★" : ""}</span>` : ` <span class="muted">· dernier étage !</span>`}</div>
          <div class="tour-card" id="tcFoe">${cardHTML(foe.card, { level: foe.level, big: true })}</div>
          <div id="hpFoe">${hpBar(foe, "foe")}</div>
        </div>
      </div>
      <div class="tour-bench">${r.mine.map((f, i) => `<div class="tour-mini ${i === r.cur ? "now" : ""} ${f.hp <= 0 ? "dead" : ""}">${cardHTML(f.card, { level: f.level })}<i style="width:${Math.max(0, f.hp)}%"></i></div>`).join("")}</div>
      <p class="tour-log muted" id="tourLog">Le combat commence !</p>
    </section>`;
    $$("[data-speed]").forEach((b) => b.addEventListener("click", () => {
      speed = +b.dataset.speed; store("bm_tour_speed", speed);
      $$("[data-speed]").forEach((x) => x.classList.toggle("on", x === b));
    }));
    $("#tourSkip").addEventListener("click", () => { if (run) run.skip = true; });
    $("#tourQuit").addEventListener("click", () => {
      if (!run) return renderPick();
      run.alive = false;
      const reached = run.floor + 1;
      run = null;
      finish(reached, false, true);
    });
  }

  const wait = (r, ms) => (r.skip ? Promise.resolve() : new Promise((res) => setTimeout(res, ms / speed)));
  const ok = (r) => r.alive && run === r;

  function popDamage(el, d) {
    if (!el) return;
    const n = document.createElement("span");
    n.className = "tour-dmg" + (d.crit ? " crit" : "");
    n.textContent = (d.crit ? "CRITIQUE ! " : "") + "-" + d.dmg;
    el.appendChild(n);
    setTimeout(() => n.remove(), 1000);
  }
  function anim(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  // Un coup de a sur b : dégâts + petites animations
  async function strike(r, attacker, target, mineAttacks) {
    const d = hit(attacker.atk, target.def);
    target.hp = Math.max(0, target.hp - d.dmg);
    if (r.skip) return d;
    const a = $(mineAttacks ? "#tcMe" : "#tcFoe"), t = $(mineAttacks ? "#tcFoe" : "#tcMe");
    anim(a, mineAttacks ? "lunge-r" : "lunge-l", 420);
    await wait(r, 180);
    if (!ok(r)) return d;
    anim(t, "hurt", 420);
    popDamage(t, d);
    const hp = $(mineAttacks ? "#hpFoe" : "#hpMe");
    if (hp) hp.innerHTML = hpBar(target, mineAttacks ? "foe" : "me");
    const mini = $$(".tour-bench .tour-mini")[r.cur];
    if (!mineAttacks && mini) $("i", mini).style.width = target.hp + "%";
    const log = $("#tourLog");
    if (log) log.innerHTML = `<b>${esc(attacker.card.nom)}</b> inflige <b>${d.dmg}</b> dégâts${d.crit ? " (critique !)" : ""} à <b>${esc(target.card.nom)}</b>.`;
    await wait(r, 520);
    return d;
  }

  async function loop(r) {
    await wait(r, 700);
    let mineTurn = true; // ta carte frappe en premier à chaque nouveau duel
    while (ok(r)) {
      const me = r.mine[r.cur], foe = r.foe;
      if (mineTurn) await strike(r, me, foe, true); else await strike(r, foe, me, false);
      if (!ok(r)) return;
      mineTurn = !mineTurn;
      if (foe.hp <= 0) {
        r.kills++;
        if (!r.skip) { anim($("#tcFoe"), "ko", 700); await wait(r, 650); if (!ok(r)) return; }
        if (r.floor + 1 >= r.tower.length) return end(r, true);
        r.floor++;
        r.foe = fighter(r.tower[r.floor].card, r.tower[r.floor].level);
        mineTurn = true;
        if (!r.skip) { drawBattle(); anim($("#tcFoe"), "enter-r", 500); $("#tourLog").innerHTML = `Étage <b>${r.floor + 1}</b> : <b>${esc(r.foe.card.nom)}</b> arrive !`; await wait(r, 650); }
      } else if (me.hp <= 0) {
        if (!r.skip) { anim($("#tcMe"), "ko", 700); await wait(r, 650); if (!ok(r)) return; }
        if (r.cur + 1 >= r.mine.length) return end(r, false);
        r.cur++;
        mineTurn = true;
        if (!r.skip) { drawBattle(); anim($("#tcMe"), "enter-l", 500); $("#tourLog").innerHTML = `<b>${esc(r.mine[r.cur].card.nom)}</b> prend le relais !`; await wait(r, 650); }
      }
    }
  }

  function end(r, conquered) {
    if (!ok(r)) return;
    run = null;
    // étage atteint = l'étage où l'équipe est tombée (ou le dernier si la tour est conquise)
    finish(conquered ? r.tower.length : r.floor + 1, conquered, false, r.kills);
  }

  function finish(reached, conquered, quit, kills) {
    const best = load(KEY_BEST, 0);
    const record = reached > best && !quit;
    if (record) store(KEY_BEST, reached);
    if (!quit && BM.UI.currentPage === "tour") drawBattle0();
    BM.UI.openModal(`
      <div class="confirm mm-result ${conquered ? "win" : ""}">
        <div class="mm-big">${conquered ? "👑" : quit ? "🏳️" : "🗼"}</div>
        <h2>${conquered ? "Tour Infernale conquise !" : quit ? "Tu as quitté la tour" : `Étage ${reached} atteint`}</h2>
        <p class="muted">${conquered ? "Tes cartes ont battu toutes les cartes du jeu. Incroyable." : quit ? `Tu étais à l'étage ${reached}.` : `Ton équipe est tombée à l'étage ${reached} sur ${floors().length}${kills != null ? ` (${kills} carte${kills > 1 ? "s" : ""} battue${kills > 1 ? "s" : ""})` : ""}.`}</p>
        ${record ? `<div class="mm-reward">🏆 Nouveau record : étage ${reached} !</div>` : !quit ? `<p class="muted small">Ton record : étage ${Math.max(best, reached)}</p>` : ""}
        <p class="muted small">🎁 Récompenses selon l'étage atteint : bientôt !</p>
        <div class="pull-actions"><button class="btn" data-team>Changer d'équipe</button><button class="btn btn-primary" data-again>🔁 Recommencer</button></div>
      </div>`);
    $("#modalContent [data-team]").addEventListener("click", () => { BM.UI.closeModal(); renderPick(); });
    $("#modalContent [data-again]").addEventListener("click", () => {
      BM.UI.closeModal();
      const byId = Object.fromEntries(mine().map((x) => [x.card.id, x]));
      const picked = team.map((id) => byId[id]).filter(Boolean);
      picked.length ? start(picked) : renderPick();
    });
  }
  // Après « Passer » : on affiche l'état final du combat derrière la fenêtre
  function drawBattle0() { if (lastRun) { const keep = run; run = lastRun; drawBattle(); run = keep; } }

  BM.UI.page("tour", () => { if (run) { run.alive = false; run = null; } renderPick(); });
})();
