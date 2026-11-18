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

  // Raio de "perto da minha base" (Início e Rankings): 50, 100 ou 200 km, lembrado no aparelho
  var RAIOS = [50, 100, 200];
  var raio = {
    opcoes: RAIOS,
    atual: function () { var r = ler("sd.raio"); return RAIOS.indexOf(r) >= 0 ? r : 100; },
    escolhe: function (r) { if (RAIOS.indexOf(r) >= 0) gravar("sd.raio", r); }
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

  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  // "10/2026" -> "out/2026"
  function mesAno(mmaaaa) {
    var p = String(mmaaaa || "").split("/");
    var m = Number(p[0]);
    return p.length === 2 && m >= 1 && m <= 12 ? MESES[m - 1] + "/" + p[1] : String(mmaaaa || "");
  }

  // Linha de fonte das telas: "Dados ANEEL de out/2026 · IBGE (PIB 2021, pop. 2024)".
  // A origem técnica (Databricks ao vivo ou cópia) fica só em Perfil > Sobre os dados.
  function linhaFonte(ref) {
    return "Dados ANEEL de " + mesAno(ref.aneel) + " · IBGE (PIB " + ref.pib + ", pop. " + ref.populacao + ")";
  }

  // Perfil > Sobre os dados: de onde o app está lendo agora
  function origemDados() {
    return api("/status", { publica: true }).then(function (s) {
      return s.fonte === "databricks" ? "Lendo ao vivo do Databricks." : "Lendo uma cópia do Databricks de " + dataCurta(s.carregado_em) + ".";
    });
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

  // Sugestões, buscadas uma vez por tela: no Explorar, as menos exploradas (acima de 100 mil hab.);
  // na escolha da cidade-base, as maiores cidades (a base é onde a empresa está, não uma oportunidade)
  var sugestoes = {};
  function preencheSugestoes(lista, aoEscolher, tipo) {
    tipo = tipo || "oportunidade";
    if (!sugestoes[tipo]) sugestoes[tipo] = api(tipo === "populacao" ? "/rankings?tipo=populacao&limite=5"
      : "/rankings?tipo=oportunidade&pop_min=100000&limite=5");
    sugestoes[tipo].then(function (itens) {
      lista.innerHTML = "";
      itens.forEach(function (m) {
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.innerHTML = '<span class="results__name">' + escapa(m.nome + ", " + m.uf) + "</span>" + (tipo === "populacao"
          ? '<span class="results__kind">' + escapa(texto(compacto(m.populacao))) + " hab.</span>"
          : '<span class="results__score">Nota ' + m.ipne + "</span>");
        b.addEventListener("click", function () {
          aoEscolher({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf });
        });
        li.appendChild(b);
        lista.appendChild(li);
      });
    }).catch(function () { sugestoes[tipo] = null; lista.innerHTML = ""; });
  }

  // Seletor de local em tela cheia (<dialog>), criado sob demanda.
  // opcoes (opcional): {titulo, texto, pular} para perguntas como "Onde fica sua base?"; fechar = pular.
  var seletor = null;
  function abreSeletor(aoEscolher, opcoes) {
    opcoes = opcoes || {};
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
        '<p class="picker__intro" id="picker-intro" hidden></p>' +
        '<div class="search" role="search">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<label class="visually-hidden" for="picker-busca">Buscar estado ou município</label>' +
          '<input id="picker-busca" type="search" placeholder="Digite um município ou estado" autocomplete="off" enterkeyhint="search">' +
        "</div>" +
        '<ul class="results rows" id="picker-resultados" aria-live="polite"></ul>' +
        '<div id="picker-inicial">' +
          '<p class="picker__label">Recentes</p>' +
          '<nav class="recent" aria-label="Consultas recentes" id="picker-recentes"></nav>' +
          '<p class="picker__label" id="picker-sug-titulo">Maiores cidades</p>' +
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
    el("picker-titulo").textContent = opcoes.titulo || "Escolher local";
    var intro = el("picker-intro");
    intro.innerHTML = "";
    intro.hidden = !opcoes.texto && !opcoes.pular;
    if (opcoes.texto) intro.appendChild(document.createTextNode(opcoes.texto + " "));
    if (opcoes.pular) {
      var pular = document.createElement("button");
      pular.type = "button";
      pular.className = "text-link link-button";
      pular.textContent = "Pular por enquanto";
      pular.addEventListener("click", function () { seletor.close(); });
      intro.appendChild(pular);
    }
    preencheRecentes(el("picker-recentes"), seletor._escolhe);
    preencheSugestoes(el("picker-sugestoes"), seletor._escolhe, "populacao");
    el("picker-busca").value = "";
    el("picker-resultados").innerHTML = "";
    el("picker-inicial").hidden = false;
    seletor.showModal();
    el("picker-busca").focus();
  }

  // ---------- Itens de "onde vender" (Início e Rankings) ----------

  // Selos de um município do ranking: distância (só quando veio base), os dois modelos e prédios.
  // O motivo de "Muitos prédios" fica visível na própria linha, não só no title.
  function selos(m) {
    var partes = [];
    if (m.distancia_km != null) partes.push('<span class="rank__dist">' + numero(m.distancia_km) + " km</span>");
    if (m.concordam) partes.push('<span class="selo selo--concordam">Confirmado por 2 modelos</span>');
    if (m.discordam) partes.push('<span class="selo selo--alerta">Modelos discordam</span>');
    if (m.apartamentos) partes.push('<span class="selo">Muitos prédios</span>');
    var html = partes.length ? '<span class="selos">' + partes.join("") + "</span>" : "";
    if (m.apartamentos) html += '<span class="rank__nota">Muita gente mora em prédio: parte dos clientes são condomínios e empresas.</span>';
    return html;
  }

  // Cabeçalho da coluna da direita em cada ordenação (Rankings)
  var COLUNA = { espaco: "Clientes", oportunidade: "Nota", adocao: "Instaladas" };

  // Linha de ranking de municípios. A coluna da direita e a barra seguem o critério da lista:
  // - espaco: clientes em potencial (barra relativa ao maior da lista); nota e nível pequenos na meta
  // - oportunidade: nota de 0 a 100 com o nível embaixo; barra = nota
  // - adocao: instalações hoje, sem barra
  function itemMunicipio(m, criterio, maiorEspaco) {
    var li = document.createElement("li");
    li.className = "rank";
    var meta = [], valor, barra = null;

    if (criterio === "adocao") {
      if (m.distancia_km != null) meta.push(numero(m.distancia_km) + " km");
      meta.push(texto(potencia(m.potencia_kw)) + " instalados");
      valor = '<span class="visually-hidden">Instalações hoje: </span>' + escapa(texto(compacto(m.instalacoes)));
    } else if (criterio === "oportunidade") {
      if (m.manchete) meta.push(m.manchete);
      valor = '<span class="visually-hidden">Nota de oportunidade </span>' + (m.ipne != null ? m.ipne : "–") +
        (m.nivel ? '<span class="rank__sub">' + escapa(m.nivel) + "</span>" : "");
      if (m.ipne != null) barra = m.ipne;
    } else {
      var temEspaco = m.espaco != null && m.espaco > 0;
      if (temEspaco && m.espaco_kw) meta.push("~" + texto(potencia(m.espaco_kw)));
      if (m.ipne != null) meta.push("Nota " + m.ipne + (m.nivel ? " · " + m.nivel : ""));
      valor = '<span class="visually-hidden">Clientes em potencial: </span>' + (temEspaco ? escapa(texto(compacto(m.espaco))) : "–") +
        '<span class="rank__sub">clientes</span>';
      if (temEspaco && maiorEspaco > 0) barra = Math.max(m.espaco / maiorEspaco * 100, 1.5);
    }

    li.innerHTML =
      '<span class="rank__pos">' + m.posicao + "</span>" +
      '<span><a class="rank__name" href="' + explorar.link({ tipo: "municipio", codigo: m.codigo }) + '">' + escapa(m.nome + ", " + m.uf) + "</a>" +
      (meta.length ? '<span class="rank__meta">' + escapa(meta.join(" · ")) + "</span>" : "") +
      (criterio === "adocao" ? "" : selos(m)) + "</span>" +
      '<span class="rank__value">' + valor + "</span>" +
      (barra != null ? '<span class="rank__bar" aria-hidden="true"><span style="width: ' + barra.toFixed(1) + '%"></span></span>' : "");
    return li;
  }

  // Preenche uma <ol> de municípios. Em "espaco" (sem "Incluir cidades com ressalvas"), a API manda
  // as cidades duvidosas para o fim: um separador discreto marca onde elas começam.
  function preencheMunicipios(ol, itens, criterio, separaDuvidosas) {
    var frag = document.createDocumentFragment();
    var maior = 0, separou = false, i;
    if (criterio === "espaco") {
      for (i = 0; i < itens.length; i++) if (itens[i].espaco > maior) maior = itens[i].espaco;
    }
    for (i = 0; i < itens.length; i++) {
      var m = itens[i];
      if (separaDuvidosas && !separou && m.duvidoso) {
        separou = true;
        var sep = document.createElement("li");
        sep.className = "rank-sep";
        sep.textContent = "Com ressalvas (muitos prédios ou modelos em desacordo)";
        frag.appendChild(sep);
      }
      frag.appendChild(itemMunicipio(m, criterio, maior));
    }
    ol.innerHTML = "";
    ol.appendChild(frag);
  }

  // Frase única sobre os dois modelos (vem pronta da API). Estilo de alerta quando discordam.
  function preencheVeredito(p, veredito, discordam) {
    p.hidden = !veredito;
    p.textContent = veredito || "";
    p.classList.toggle("veredito--alerta", !!discordam);
  }

  // Bloco "Por que vender aqui": some quando não há argumentos (estados vêm com lista vazia)
  function preencheArgumentos(bloco, lista, argumentos) {
    lista.innerHTML = "";
    var itens = argumentos || [];
    bloco.hidden = !itens.length;
    itens.forEach(function (a) {
      var li = document.createElement("li");
      li.textContent = a.texto;
      lista.appendChild(li);
    });
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
  // Vocabulário para o vendedor leigo (igual ao mobile e à API): "clientes em potencial",
  // "cidades parecidas", "nota de oportunidade". "IPNE" só aparece na ajuda e na metodologia.
  // Rodapés: no máximo 2 frases curtas.
  var textos = {
    cidadesParecidas: "Cidades parecidas: quantas instalações costuma ter uma cidade do mesmo estado com renda, população, domicílios e sol parecidos.",
    legendaNota: "Nota de 0 a 100: quanto maior, menos explorada a cidade em relação a cidades parecidas.",
    ressalva: "Mostra onde procurar clientes. Não garante vendas.",
    criterio: {
      espaco: "Clientes em potencial: instalações que faltam para a cidade chegar ao nível de cidades parecidas.",
      oportunidade: "Menos exploradas: ordena pela nota de oportunidade (0 a 100), que favorece cidades menores.",
      adocao: "Instaladas: sistemas solares registrados hoje na ANEEL."
    },
    // linha abaixo dos chips quando "Onde já se vende mais" está ativo
    adocaoAviso: "Mostra onde já existem mais instalações hoje: mercado consolidado, com mais concorrência. Não é oportunidade.",
    estados: "Soma dos clientes em potencial dos municípios. Por domicílio compara estados grandes e pequenos; o DF fica de fora.",
    // Painel do ⓘ ao lado da nota (HTML)
    comoLerNota: "<p>A <strong>nota de oportunidade</strong> (IPNE, Índice de Potencial Não Explorado) compara as instalações " +
      "de hoje com as de <strong>cidades parecidas</strong>: mesma faixa de renda, população, domicílios e sol, no mesmo estado.</p>" +
      "<p>Vai de 0 a 100. <strong>Perto de 100</strong>: muito pouco explorada. <strong>Perto de 0</strong>: muito bem explorada.</p>" +
      "<p>Mostra onde procurar clientes. Não garante vendas. <a class=\"text-link\" href=\"perfil.html#como-ler\">Como a nota é calculada</a></p>",
    semelhantes: function (nome) {
      return "Cidades do Brasil com população, renda e domicílios mais próximos de " + nome + ". Servem para comparar.";
    },
    // Quando não há nota (estado ou DF): mesma mensagem em todas as abas. Devolve HTML.
    semNota: function (r) {
      if (r.tipo === "uf") {
        return "A nota de oportunidade é calculada por município. " +
          '<a class="text-link" href="rankings.html?uf=' + encodeURIComponent(r.uf) + '">Ver os municípios com mais clientes em potencial em ' +
          escapa(r.nome) + "</a>.";
      }
      return "Sem nota: ela compara cada município com outros do mesmo estado, e o Distrito Federal tem um só.";
    }
  };

  window.SD = {
    textos: textos,
    api: api, sessao: sessao, local: local, raio: raio, explorar: explorar, linhaFonte: linhaFonte, origemDados: origemDados,
    ligaMostrarSenha: ligaMostrarSenha,
    COLUNA: COLUNA, itemMunicipio: itemMunicipio, preencheMunicipios: preencheMunicipios, preencheVeredito: preencheVeredito,
    preencheArgumentos: preencheArgumentos,
    ligaBusca: ligaBusca, preencheRecentes: preencheRecentes, preencheSugestoes: preencheSugestoes, abreSeletor: abreSeletor,
    fmt: { numero: numero, compacto: compacto, potencia: potencia, texto: texto, reaisMil: reaisMil, variacao: variacao, iniciais: iniciais, mesAno: mesAno },
    el: el, escapa: escapa, trazParaTela: trazParaTela
  };
})();
