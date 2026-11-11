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

  function adicionaRecente(item) {
    var recentes = (ler("sd.recentes") || [LOCAL_PADRAO]).filter(function (r) {
      return !(r.tipo === item.tipo && String(r.codigo) === String(item.codigo));
    });
    recentes.unshift(item);
    gravar("sd.recentes", recentes.slice(0, 4));
  }

  function itemLocal(l) { return { tipo: l.tipo, codigo: l.codigo, nome: l.nome, uf: l.uf }; }

  // "Minha cidade" (Início). Só muda quando o usuário troca o local no topo do Início.
  var local = {
    atual: function () { return ler("sd.local") || LOCAL_PADRAO; },
    escolhido: function () { return ler("sd.local") !== null; },
    escolhe: function (l) {
      var item = itemLocal(l);
      gravar("sd.local", item);
      adicionaRecente(item);
    },
    recentes: function () { return ler("sd.recentes") || [LOCAL_PADRAO]; },
    rotulo: function (l) { return l.tipo === "uf" ? l.nome : l.nome + ", " + l.uf; },
    caminho: function (l) { return (l.tipo === "uf" ? "/ufs/" : "/municipios/") + encodeURIComponent(l.codigo); },
    mesmo: function (a, b) { return !!a && !!b && a.tipo === b.tipo && String(a.codigo) === String(b.codigo); }
  };

  // Local aberto em Explorar: independente da "minha cidade" do Início
  var explorar = {
    atual: function () { return ler("sd.explorar") || local.atual(); },
    escolhe: function (l) {
      var item = itemLocal(l);
      gravar("sd.explorar", item);
      adicionaRecente(item);
    },
    // link para abrir um município ou estado em Explorar
    link: function (l) {
      return "indicadores.html?" + (l.tipo === "uf" ? "uf=" : "m=") + encodeURIComponent(l.codigo);
    }
  };

  // Linha de fonte: "ANEEL 10/2026 · IBGE · ao vivo do Databricks"
  function linhaFonte(ref) {
    return api("/status", { publica: true }).then(function (s) {
      var origem = s.fonte === "databricks" ? "ao vivo do Databricks" : "Databricks, cópia de " + dataCurta(s.carregado_em);
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

  // ---------- Busca de local (compartilhada pelo seletor do Início e pela tela Indicadores) ----------

  // Liga um campo de busca a uma lista de resultados. Chama aoEscolher({tipo, codigo, nome, uf}).
  function ligaBusca(input, lista, aoEscolher) {
    var timer = null, controle = null;

    function limpa() { lista.innerHTML = ""; }

    function mostra(itens) {
      if (!itens.length) {
        lista.innerHTML = '<li class="results__empty">Nenhum estado ou município encontrado.</li>';
        return;
      }
      lista.innerHTML = "";
      // estados e municípios em grupos com título quando aparecem os dois tipos
      var grupos = itens.some(function (it) { return it.tipo === "uf"; }) && itens.some(function (it) { return it.tipo !== "uf"; });
      var tipoAnterior = null;
      itens.forEach(function (it) {
        if (grupos && it.tipo !== tipoAnterior) {
          var titulo = document.createElement("li");
          titulo.className = "results__group";
          titulo.setAttribute("aria-hidden", "true");
          titulo.textContent = it.tipo === "uf" ? "Estados" : "Municípios";
          lista.appendChild(titulo);
          tipoAnterior = it.tipo;
        }
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.innerHTML = '<span class="results__name">' + escapa(local.rotulo(it)) + '</span><span class="results__kind">' +
          (it.tipo === "uf" ? "Estado" : "Município · " + escapa(it.uf)) + "</span>";
        b.addEventListener("click", function () { input.value = ""; limpa(); aoEscolher(it); });
        li.appendChild(b);
        lista.appendChild(li);
      });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { if (controle) controle.abort(); limpa(); return; }
      timer = setTimeout(function () {
        if (controle) controle.abort();
        controle = new AbortController();
        api("/busca?q=" + encodeURIComponent(q), { signal: controle.signal })
          .then(mostra)
          .catch(function (e) {
            if (e.name !== "AbortError") lista.innerHTML = '<li class="results__empty">' + escapa(e.message) + "</li>";
          });
      }, 180);
    });

    input.addEventListener("keydown", function (ev) {
      var botoes = Array.prototype.slice.call(lista.querySelectorAll("button"));
      if (ev.key === "Enter" && botoes.length) { ev.preventDefault(); botoes[0].click(); }
      if (ev.key === "ArrowDown" && botoes.length) { ev.preventDefault(); botoes[0].focus(); }
    });

    // Setas navegam entre os resultados; seta para cima no primeiro volta ao campo
    lista.addEventListener("keydown", function (ev) {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      var botoes = Array.prototype.slice.call(lista.querySelectorAll("button"));
      var i = botoes.indexOf(document.activeElement);
      if (i < 0) return;
      ev.preventDefault();
      var prox = ev.key === "ArrowDown" ? botoes[i + 1] : botoes[i - 1];
      (prox || (ev.key === "ArrowUp" ? input : botoes[i])).focus();
    });

    return { limpa: limpa };
  }

  // Botões das consultas recentes
  function preencheRecentes(nav, aoEscolher, atual) {
    atual = atual || local.atual();
    nav.innerHTML = "";
    local.recentes().forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = local.rotulo(l);
      if (local.mesmo(l, atual)) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { aoEscolher(l); });
      nav.appendChild(b);
    });
  }

  // Sugestões: os municípios com maior IPNE (acima de 100 mil hab.), buscados uma vez por tela
  var sugestoes = null;
  function preencheSugestoes(lista, aoEscolher) {
    if (!sugestoes) sugestoes = api("/rankings?tipo=oportunidade&pop_min=100000&limite=5");
    sugestoes.then(function (itens) {
      lista.innerHTML = "";
      itens.forEach(function (m) {
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.innerHTML = '<span class="results__name">' + escapa(m.nome + ", " + m.uf) + '</span><span class="results__score">IPNE ' + m.ipne + "</span>";
        b.addEventListener("click", function () {
          aoEscolher({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf });
        });
        li.appendChild(b);
        lista.appendChild(li);
      });
    }).catch(function () { sugestoes = null; lista.innerHTML = ""; });
  }

  // Seletor de local em tela cheia (<dialog>), criado sob demanda
  var seletor = null;
  function abreSeletor(aoEscolher) {
    if (!seletor) {
      seletor = document.createElement("dialog");
      seletor.className = "picker";
      seletor.setAttribute("aria-labelledby", "picker-titulo");
      seletor.innerHTML =
        '<div class="picker__head">' +
          '<h2 class="picker__title" id="picker-titulo">Escolher local</h2>' +
          '<button class="picker__close" type="button" aria-label="Fechar">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
          "</button>" +
        "</div>" +
        '<div class="search" role="search">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<label class="visually-hidden" for="picker-busca">Buscar estado ou município</label>' +
          '<input id="picker-busca" type="search" placeholder="Digite um município ou estado" autocomplete="off" enterkeyhint="search">' +
        "</div>" +
        '<ul class="results rows" id="picker-resultados" aria-live="polite"></ul>' +
        '<div id="picker-inicial">' +
          '<p class="picker__label">Recentes</p>' +
          '<nav class="recent" aria-label="Consultas recentes" id="picker-recentes"></nav>' +
          '<p class="picker__label" id="picker-sug-titulo">Maior oportunidade</p>' +
          '<ul class="results rows" id="picker-sugestoes" aria-labelledby="picker-sug-titulo"></ul>' +
        "</div>";
      document.body.appendChild(seletor);

      seletor.querySelector(".picker__close").addEventListener("click", function () { seletor.close(); });
      // clique no fundo escurecido fecha
      seletor.addEventListener("click", function (ev) { if (ev.target === seletor) seletor.close(); });
      ligaBusca(el("picker-busca"), el("picker-resultados"), function (l) { seletor._escolhe(l); });
      // recentes e sugestões saem de cena enquanto há texto digitado
      el("picker-busca").addEventListener("input", function () {
        el("picker-inicial").hidden = el("picker-busca").value.trim().length >= 2;
      });
    }

    seletor._escolhe = function (l) {
      local.escolhe(l);
      seletor.close();
      aoEscolher(l);
    };
    preencheRecentes(el("picker-recentes"), seletor._escolhe);
    preencheSugestoes(el("picker-sugestoes"), seletor._escolhe);
    el("picker-busca").value = "";
    el("picker-resultados").innerHTML = "";
    el("picker-inicial").hidden = false;
    seletor.showModal();
    el("picker-busca").focus();
  }

  // "Ver menos": se o topo da lista recolhida ficou acima da tela, volta até ele
  function trazParaTela(elemento) {
    if (elemento.getBoundingClientRect().top >= 0) return;
    var suave = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    elemento.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
  }

  function el(id) { return document.getElementById(id); }

  function escapa(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Textos explicativos repetidos em várias abas: uma fonte só, para todas dizerem o mesmo.
  // (Manchete, nível e alertas de cada município vêm da API.)
  var textos = {
    esperadoPerfil: "Esperado pelo perfil: quantas instalações o modelo estima para um município com essa renda, PIB, população, " +
      "densidade, domicílios e sol, comparando com os outros municípios do mesmo estado.",
    legendaIPNE: "Quanto maior o IPNE, mais espaço para crescer em relação ao esperado pelo perfil. Perto de 0, o mercado já está maduro.",
    ressalva: "Indica onde investigar, não garante demanda.",
    // Painel do ⓘ ao lado do IPNE (HTML)
    comoLerIPNE: "<p>O <strong>IPNE</strong> (Índice de Potencial Não Explorado) compara as instalações solares de hoje com o " +
      "<strong>esperado pelo perfil</strong>: quantas um município com essa renda, PIB, população, densidade, domicílios e sol " +
      "costuma ter no mesmo estado.</p>" +
      "<p>Vai de 0 a 100. <strong>Perto de 100</strong>: bem abaixo do esperado, alta oportunidade. " +
      "<strong>Perto de 0</strong>: acima do esperado, mercado maduro.</p>" +
      "<p>Indica onde investigar, não garante demanda. <a class=\"text-link\" href=\"perfil.html#como-ler\">Metodologia completa</a></p>",
    semelhantes: function (nome) {
      return "Municípios do Brasil com população, PIB per capita, renda, densidade e domicílios por habitante mais próximos de " +
        nome + ". Servem para comparar pares; o IPNE de cada um compara com o próprio estado.";
    },
    // Quando não há score (estado ou DF): mesma mensagem em todas as abas. Devolve HTML.
    semIPNE: function (r) {
      if (r.tipo === "uf") {
        return "O IPNE é calculado por município, comparando cada um com o esperado pelo perfil no mesmo estado. " +
          '<a class="text-link" href="rankings.html?uf=' + encodeURIComponent(r.uf) + '">Ver os municípios com maior oportunidade em ' +
          escapa(r.nome) + "</a>.";
      }
      return "Sem score: o IPNE compara cada município com outros do mesmo estado, e o Distrito Federal tem um só.";
    }
  };

  window.SD = {
    textos: textos,
    api: api, sessao: sessao, local: local, explorar: explorar, linhaFonte: linhaFonte, ligaMostrarSenha: ligaMostrarSenha,
    ligaBusca: ligaBusca, preencheRecentes: preencheRecentes, preencheSugestoes: preencheSugestoes, abreSeletor: abreSeletor,
    fmt: { numero: numero, compacto: compacto, potencia: potencia, texto: texto, reaisMil: reaisMil, variacao: variacao, iniciais: iniciais },
    el: el, escapa: escapa, trazParaTela: trazParaTela
  };
})();
