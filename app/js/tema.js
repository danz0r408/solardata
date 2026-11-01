/* Tema claro/escuro: roda no <head>, antes do CSS desenhar, para não piscar o tema errado.
   "sistema" (padrão) segue o aparelho; "claro" e "escuro" fixam via data-theme no <html>. */
(function () {
  var tema = "sistema";
  try { tema = JSON.parse(localStorage.getItem("sd.tema")) || "sistema"; } catch (e) { /* sem storage: segue o sistema */ }
  if (tema === "claro") document.documentElement.setAttribute("data-theme", "light");
  else if (tema === "escuro") document.documentElement.setAttribute("data-theme", "dark");
})();
