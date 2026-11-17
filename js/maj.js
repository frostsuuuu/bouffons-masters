/* =========================================================
   MISE À JOUR AUTOMATIQUE
   ---------------------------------------------------------
   Toutes les minutes (et quand on revient sur l'onglet), on
   regarde si les fichiers du jeu ont changé sur le serveur.
   Si oui : petit bandeau, puis rechargement de la page dès que
   le joueur n'est pas en train d'ouvrir un booster.
   ========================================================= */
(function () {
  if (location.protocol === "file:") return; // jeu ouvert en local : rien à faire

  const files = ["index.html"].concat(BM_FILES.css, BM_FILES.js);
  let reference = null;
  let pending = false;

  async function signature() {
    const tags = await Promise.all(files.map((f) =>
      fetch(f, { method: "HEAD", cache: "no-store" })
        .then((r) => (r.ok ? (r.headers.get("etag") || r.headers.get("last-modified") || "") : "absent"))
        .catch(() => null)));
    if (tags.some((t) => t === null)) return null; // hors ligne : on réessaiera
    return tags.join("|");
  }

  // Le joueur est occupé : booster en cours d'ouverture, fiche ouverte, création de compte…
  function busy() {
    return !!(document.querySelector("#stage .slot") ||
      document.getElementById("onboard") ||
      !document.getElementById("modal").hidden ||
      document.querySelector(".fusion-anim"));
  }

  function banner() {
    if (document.getElementById("majBanner")) return;
    const b = document.createElement("div");
    b.id = "majBanner";
    b.textContent = "✨ Nouvelle version du jeu ! Mise à jour…";
    b.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:500;" +
      "padding:10px 18px;border-radius:12px;font-weight:700;color:#fff;" +
      "background:linear-gradient(120deg,#ff3cac,#7b5cff 55%,#2bd2ff);box-shadow:0 10px 30px rgba(0,0,0,.5);";
    document.body.appendChild(b);
  }

  function reloadWhenFree() {
    if (busy()) return setTimeout(reloadWhenFree, 2000);
    banner();
    setTimeout(() => location.reload(), 1200);
  }

  async function check() {
    if (pending || document.hidden) return;
    const s = await signature();
    if (!s) return;
    if (reference === null) { reference = s; return; }
    if (s !== reference) { pending = true; reloadWhenFree(); }
  }

  setTimeout(check, 3000);                 // photo de la version chargée
  setInterval(check, 60000);               // puis vérification toutes les minutes
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.BM_MAJ = { check }; // pour tester
})();
