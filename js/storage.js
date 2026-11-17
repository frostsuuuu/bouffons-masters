/* =========================================================
   SAUVEGARDE
   ---------------------------------------------------------
   Pour l'instant : sauvegarde dans le navigateur (localStorage).
   Plus tard (comptes joueurs), on remplacera seulement ce fichier
   par des appels à un serveur — le reste du jeu ne changera pas.
   ========================================================= */
window.BM = window.BM || {};

BM.Storage = (function () {
  const key = () => BM.CONFIG.cleSauvegarde;
  let memoire = null; // secours si le navigateur bloque localStorage

  return {
    load() {
      try {
        const raw = localStorage.getItem(key());
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return memoire ? JSON.parse(memoire) : null;
      }
    },
    save(state) {
      const raw = JSON.stringify(state);
      memoire = raw;
      try { localStorage.setItem(key(), raw); } catch (e) { /* mode mémoire */ }
    },
    clear() {
      memoire = null;
      try { localStorage.removeItem(key()); } catch (e) {}
    }
  };
})();
