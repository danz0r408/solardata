/* SolarData: cliente da API, sessão e formatação (compartilhado por todas as telas) */
(function () {
  "use strict";

  var API = window.SOLARDATA_API || "";
  var LOCAL_PADRAO = { tipo: "municipio", codigo: 3509502, nome: "Campinas", uf: "SP" };

  // localStorage pode falhar (aba anônima, bloqueio): a sessão cai para memória
  var memoria = {};
  function ler(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return memoria[chave] || null; }
  }
  function gravar(chave, valor) {
    memoria[chave] = valor;
    try {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) { /* segue com a cópia em memória */ }
  }

  var sessao = {
    token: function () { return ler("sd.token"); },
    usuario: function () { return ler("sd.usuario"); },
    entra: function (dados) { gravar("sd.token", dados.token); gravar("sd.usuario", dados.usuario); },
    atualizaUsuario: function (u) { gravar("sd.usuario", u); },
    sai: function () { gravar("sd.token", null); gravar("sd.usuario", null); },
    exige: function () {
      if (!ler("sd.token")) { location.replace("login.html"); return false; }
      return true;
    }
  };

  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    var headers = { "Accept": "application/json" };
    var token = sessao.token();
    if (token) headers.Authorization = "Bearer " + token;
    if (opcoes.corpo !== undefined) headers["Content-Type"] = "application/json";

    return fetch(API + "/api" + caminho, {
      method: opcoes.metodo || "GET",
      headers: headers,
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      signal: opcoes.signal
    }).then(function (r) {
      if (r.status === 401 && !opcoes.publica) {
        sessao.sai();
        location.replace("login.html");
        return new Promise(function () {}); // a página está saindo
      }
      return r.json().catch(function () { return {}; }).then(function (corpo) {
        if (!r.ok) {
          var msg = typeof corpo.detail === "string" ? corpo.detail : "Não foi possível concluir. Tente novamente.";
          var erro = new Error(msg);
          erro.status = r.status;
          throw erro;
        }
        return corpo;
      });
    });
  }

  // ---------- Formatação pt-BR ----------

  function numero(n, casas) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }

  // 23.800 -> {valor: "23,8", unidade: "mil"}
  function compacto(n) {
    if (n === null || n === undefined) return { valor: "–", unidade: "" };
    var abs = Math.abs(n);
    if (abs >= 1e9) return { valor: numero(n / 1e9, n / 1e9 < 10 ? 2 : 1), unidade: "bi" };
    if (abs >= 1e6) return { valor: numero(n / 1e6, n / 1e6 < 10 ? 2 : 1), unidade: "mi" };
    if (abs >= 1e4) return { valor: numero(n / 1e3, 1), unidade: "mil" };
    return { valor: numero(n), unidade: "" };
  }

  function potencia(kw) {
    if (kw === null || kw === undefined) return { valor: "–", unidade: "" };
    if (kw >= 1e6) return { valor: numero(kw / 1e6, 2), unidade: "GW" };
    if (kw >= 1e3) return { valor: numero(kw / 1e3, kw >= 1e5 ? 0 : 1), unidade: "MW" };
    return { valor: numero(kw), unidade: "kW" };
  }

  function texto(par) { return par.unidade ? par.valor + " " + par.unidade : par.valor; }

  function reaisMil(milReais) {
    if (milReais === null || milReais === undefined) return "–";
    return "R$ " + texto(compacto(milReais * 1000));
  }

  function variacao(p) {
    if (p === null || p === undefined) return "";
    var v = Math.round(p * 100);
    return (v > 0 ? "+" : "") + v + "%";
  }

  function iniciais(nome) {
    var partes = (nome || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    var a = partes[0][0], b = partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] || "");
    return (a + b).toUpperCase();
  }

  function dataCurta(iso) {
    try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return iso; }
  }

  // ---------- Local selecionado e consultas recentes ----------

  var local = {
    atual: function () { return ler("sd.local") || LOCAL_PADRAO; },
    escolhe: function (l) {
      var item = { tipo: l.tipo, codigo: l.codigo, nome: l.nome, uf: l.uf };
      gravar("sd.local", item);
      var recentes = (ler("sd.recentes") || [LOCAL_PADRAO]).filter(function (r) {
        return !(r.tipo === item.tipo && String(r.codigo) === String(item.codigo));
      });
      recentes.unshift(item);
      gravar("sd.recentes", recentes.slice(0, 4));
    },
    recentes: function () { return ler("sd.recentes") || [LOCAL_PADRAO]; },
    rotulo: function (l) { return l.tipo === "uf" ? l.nome : l.nome + ", " + l.uf; },
    caminho: function (l) { return (l.tipo === "uf" ? "/ufs/" : "/municipios/") + encodeURIComponent(l.codigo); }
  };

  // Linha de fonte: "ANEEL 10/2026 · IBGE · ao vivo do Databricks"
  function linhaFonte(ref) {
    return api("/status", { publica: true }).then(function (s) {
      var origem = s.fonte === "databricks" ? "ao vivo do Databricks" : "cópia local de " + dataCurta(s.carregado_em);
      return "ANEEL " + ref.aneel + " · IBGE (PIB " + ref.pib + ", pop. " + ref.populacao + ") · " + origem;
    }).catch(function () { return "ANEEL " + ref.aneel + " · IBGE"; });
  }

  // Botões "Mostrar" dos campos de senha
  function ligaMostrarSenha() {
    document.querySelectorAll(".field__toggle").forEach(function (botao) {
      var input = botao.parentElement.querySelector("input");
      botao.setAttribute("aria-pressed", "false");
      botao.addEventListener("click", function () {
        var mostrar = input.type === "password";
        input.type = mostrar ? "text" : "password";
        botao.textContent = mostrar ? "Ocultar" : "Mostrar";
        botao.setAttribute("aria-pressed", String(mostrar));
      });
    });
  }

  function el(id) { return document.getElementById(id); }

  function escapa(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  window.SD = {
    api: api, sessao: sessao, local: local, linhaFonte: linhaFonte, ligaMostrarSenha: ligaMostrarSenha,
    fmt: { numero: numero, compacto: compacto, potencia: potencia, texto: texto, reaisMil: reaisMil, variacao: variacao, iniciais: iniciais },
    el: el, escapa: escapa
  };
})();
