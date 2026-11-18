// Explorar: busca única de cidade/estado, mapa (estados e, dentro de um estado, municípios) e ficha completa.
// O local aberto aqui é independente da "minha cidade" do Início.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { api, estatico, ignoravel, linhaFonte } from "../../lib/api";
import { useApp, useCores, useLocais } from "../../lib/estado";
import { caminho, compacto, dataCurta, mw, numero, potencia, reaisMil, rotulo, semAcento, texto } from "../../lib/fmt";
import { ESPERADO_PERFIL, IRRADIACAO_MEDIA_BRASIL, LEGENDA_IPNE, RESSALVA, semIPNE } from "../../lib/textos";
import { rampa } from "../../lib/tema";
import { CampoBusca, Recentes, Resultados, useBusca } from "../../components/Busca";
import MapaBrasil from "../../components/MapaBrasil";
import {
  Aviso, BotaoTexto, Campo, Carregando, Chip, ItemLista, Linha, MaisMenos, PorQueVender, Secao, Segmentado, Selo, Tela, Txt,
} from "../../components/ui";

const METRICAS = {
  oportunidade: {
    nome: "Oportunidade", campoUF: "ipne_ponderado", campoMun: "ipne",
    valor: (v) => numero(v, 0),
    legenda: "Oportunidade: IPNE médio dos municípios, ponderado pela população. Mostra onde mais gente vive em " +
      "cidades abaixo do esperado pelo perfil; por isso é puxado pelas cidades grandes. O Distrito Federal não tem IPNE.",
    legendaMun: "Oportunidade: IPNE de cada município (0 a 100), em relação ao esperado pelo perfil no estado. " +
      "Cor mais forte, mais espaço para crescer.",
  },
  adocao: {
    nome: "Adoção", campoUF: "inst_por_mil_hab", campoMun: "inst_por_mil_hab",
    valor: (v) => numero(v, 1) + " por mil hab.",
    legenda: "Adoção: instalações solares por 1.000 habitantes (ANEEL). Dado bruto, sem modelo.",
    legendaMun: "Adoção: instalações solares por 1.000 habitantes (ANEEL), em escala logarítmica para os " +
      "municípios de adoção baixa não ficarem todos da mesma cor.",
  },
};

const REGIOES = [
  { valor: "", titulo: "Brasil" }, { valor: "Norte", titulo: "Norte" }, { valor: "Nordeste", titulo: "Nordeste" },
  { valor: "Centro Oeste", titulo: "Centro-Oeste" }, { valor: "Sudeste", titulo: "Sudeste" }, { valor: "Sul", titulo: "Sul" },
];

const PASSO_MUN = 10;

// ---------- Ficha ----------

function Ficha({ r, metricasML, fonte }) {
  const ipne = r.ipne, ml = r.ml;
  let irr = "–", irrComp = "–";
  if (r.irradiacao_kwh_m2_dia != null) {
    irr = numero(r.irradiacao_kwh_m2_dia, 2) + " kWh/m²" + (r.irradiacao_estimada ? " (estimada)" : "");
    const rel = r.irradiacao_kwh_m2_dia / IRRADIACAO_MEDIA_BRASIL - 1;
    irrComp = Math.abs(rel) < 0.02 ? "Na média" : Math.round(Math.abs(rel) * 100) + "% " + (rel > 0 ? "mais sol" : "menos sol");
  }
  const irrNota = "INPE, Atlas Brasileiro de Energia Solar 2017 (irradiação global horizontal)" +
    (r.irradiacao_estimada ? ". Sem medição para este município: média do estado." : ".") +
    (r.tipo === "uf" ? " Média dos municípios, ponderada pela população." : "");

  return (
    <View>
      <Txt variante="titulo" accessibilityRole="header" style={{ marginTop: 32 }}>{rotulo(r)}</Txt>
      <PorQueVender argumentos={r.argumentos} style={{ marginTop: 12 }} />

      <Secao titulo="Geração solar" style={{ marginTop: 16 }}>
        <Linha rotulo="Instalações" valor={numero(r.instalacoes)} />
        <Linha rotulo="Potência instalada" valor={texto(potencia(r.potencia_kw))} />
        <Linha rotulo="Instalações por 1.000 hab." valor={numero(r.inst_por_mil_hab, 1)} />
        <Linha rotulo="Instalações por 1.000 domicílios" valor={r.inst_por_mil_domicilios != null ? numero(r.inst_por_mil_domicilios, 1) : "–"} />
        <Linha rotulo="Potência por habitante" valor={numero(r.kw_por_hab, 2) + " kW"} />
        <Linha rotulo="Unidades que recebem crédito" valor={r.uc_recebem_credito != null ? numero(r.uc_recebem_credito) : "–"} ultima />
      </Secao>

      <Secao titulo="Recurso solar">
        <Linha rotulo="Irradiação média diária" valor={irr} />
        <Linha rotulo="Comparada ao Brasil" valor={irrComp} ultima />
        <Txt variante="legenda" style={{ marginTop: 8 }}>{irrNota}</Txt>
      </Secao>

      <Secao titulo="Socioeconômico">
        <Linha rotulo="População" valor={texto(compacto(r.populacao))} />
        <Linha rotulo="Domicílios" valor={r.domicilios != null ? texto(compacto(r.domicilios)) : "–"} />
        <Linha rotulo="Renda domiciliar per capita" valor={r.renda_pc != null ? "R$ " + numero(r.renda_pc) + "/mês" : "–"} />
        <Linha rotulo="PIB" valor={reaisMil(r.pib_mil_reais)} />
        <Linha rotulo="PIB per capita" valor={r.pib_per_capita != null ? "R$ " + texto(compacto(r.pib_per_capita)) : "–"} ultima />
      </Secao>

      <Secao titulo="Oportunidade">
        {ipne ? (
          <>
            <Linha rotulo="Oportunidade (IPNE)" valor={ipne.score + " / 100"} />
            <Linha rotulo="Leitura" valor={ipne.nivel} />
            {ipne.concordam ? (
              <View style={{ flexDirection: "row", paddingVertical: 8 }}><Selo titulo="IPNE e ML concordam" tom="petrol" /></View>
            ) : null}
            <Linha rotulo="Instalações hoje" valor={numero(r.instalacoes)} />
            <Linha rotulo="Esperado pelo perfil" valor={"cerca de " + texto(compacto(ipne.referencia))} />
            <Linha rotulo="Espaço estimado" valor={ipne.em_linha ? "Em linha com o perfil"
              : ipne.espaco > 0 ? "cerca de " + texto(compacto(ipne.espaco)) + " instalações"
                : "Já " + texto(compacto(-ipne.espaco)) + " acima"} />
            <Linha rotulo="Posição em oportunidade" valor={numero(ipne.posicao) + "º de " + numero(ipne.total)} ultima />
            {ipne.contexto ? <Aviso>{ipne.contexto}</Aviso> : null}
            <Txt variante="legenda" style={{ marginTop: 8 }}>{LEGENDA_IPNE + " " + ESPERADO_PERFIL}</Txt>
          </>
        ) : <Aviso style={{ marginTop: 0 }}>{semIPNE(r)}</Aviso>}
      </Secao>

      <Secao titulo="Estimativa por Machine Learning">
        {ml ? (
          <>
            <Linha rotulo="Potência instalada" valor={mw(ml.instalada_mw)} />
            <Linha rotulo="Estimativa do modelo" valor={mw(ml.estimada_mw)} />
            <Linha rotulo="Espaço em potência" ultima
              valor={ml.potencial_adicional_mw > 0 ? "+" + mw(ml.potencial_adicional_mw) : "Já " + mw(-ml.potencial_adicional_mw) + " acima"} />
            {!ml.confiavel ? (
              <Aviso>
                Estimativa menos confiável para municípios com mais de 1 milhão de habitantes: o modelo não estima valores
                além dos que viu no treino, então tende a subestimar as maiores cidades.
              </Aviso>
            ) : null}
            <Txt variante="legenda" style={{ marginTop: 8 }}>
              {ml.algoritmo + " treinado com população, PIB per capita, densidade, domicílios, renda, empresas, irradiação e estado. " +
                "Estimativa fora da amostra (validação cruzada)" +
                (metricasML ? ": erro médio de " + numero(metricasML.erro_medio_mw, 1) + " MW." : ".") +
                " Complementa o IPNE com a ordem de grandeza em MW. " + RESSALVA}
            </Txt>
          </>
        ) : (
          <Aviso style={{ marginTop: 0 }}>
            {r.tipo === "uf"
              ? "A estimativa por Machine Learning é feita por município. Escolha um município do estado para vê-la."
              : "Sem estimativa por Machine Learning para este município."}
          </Aviso>
        )}
      </Secao>

      {fonte ? <Txt variante="legenda" style={{ marginTop: 24 }}>{rotulo(r) + " · " + fonte}</Txt> : null}
    </View>
  );
}

// ---------- Tela ----------

export default function Explorar() {
  const app = useApp();
  const { explorar } = useLocais();
  const c = useCores();
  const busca = useBusca();
  const scroll = useRef(null);
  const posicoes = useRef({ mapa: 0, ficha: 0 });
  const visto = useRef(0);

  const [estados, setEstados] = useState({});
  const [metrica, setMetrica] = useState("oportunidade");
  const [regiao, setRegiao] = useState("");
  const [dentro, setDentro] = useState(explorar.tipo === "uf" ? explorar.codigo : null);
  const [mun, setMun] = useState(null); // {sigla, paths, dados, erro}
  const [filtro, setFiltro] = useState("");
  const [limiteMun, setLimiteMun] = useState(PASSO_MUN);
  const [ficha, setFicha] = useState({ r: null, erro: null });
  const [fonte, setFonte] = useState("");
  const [metricasML, setMetricasML] = useState(null);
  const cacheUF = useRef({});

  const escolhe = useCallback((l) => app.escolheExplorar(l), [app]);

  // estados (cores do mapa) e métricas do modelo de ML, uma vez
  useEffect(() => {
    const controle = new AbortController();
    api("/ufs", { signal: controle.signal }).then((lista) => {
      const porSigla = {};
      lista.forEach((u) => { porSigla[u.codigo] = u; });
      setEstados(porSigla);
    }).catch((e) => { if (!ignoravel(e)) setFicha((f) => ({ ...f, erro: e.message })); });
    api("/modelo", { signal: controle.signal })
      .then((m) => setMetricasML(m.ml && m.ml.erro_medio_mw != null ? m.ml : null))
      .catch(() => { /* informação complementar */ });
    return () => controle.abort();
  }, []);

  // estado escolhido: o mapa entra nele. Município de outro estado com o mapa aberto: o mapa acompanha.
  useEffect(() => {
    if (explorar.tipo === "uf") setDentro(explorar.codigo);
    else setDentro((d) => (d && d !== explorar.uf ? explorar.uf : d));
    // pedidoExplorar: tocar de novo no mesmo estado (depois de voltar ao Brasil) também entra nele
  }, [explorar.tipo, explorar.codigo, explorar.uf, app.pedidoExplorar]);

  // ficha do local aberto
  useEffect(() => {
    const controle = new AbortController();
    setFicha({ r: null, erro: null });
    api(caminho(explorar), { signal: controle.signal })
      .then((r) => {
        setFicha({ r, erro: null });
        linhaFonte(r.referencias, dataCurta).then(setFonte);
      })
      .catch((e) => {
        if (!ignoravel(e)) setFicha({ r: null, erro: e.status === 404 ? "Local não encontrado. Busque outro acima." : e.message });
      });
    return () => controle.abort();
  }, [explorar.tipo, explorar.codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  // municípios do estado aberto (contornos do site + números da API), guardados para não baixar de novo
  useEffect(() => {
    setFiltro("");
    setLimiteMun(PASSO_MUN);
    if (!dentro) { setMun(null); return undefined; }
    let vivo = true;
    setMun({ sigla: dentro, paths: null, dados: null, erro: null });
    if (!cacheUF.current[dentro]) {
      const p = Promise.all([
        estatico("mapas/municipios/" + encodeURIComponent(dentro) + ".json"),
        api("/ufs/" + encodeURIComponent(dentro) + "/municipios"),
      ]).then(([paths, lista]) => {
        const dados = {};
        lista.forEach((m) => { dados[m.codigo] = m; });
        return { paths, dados, lista };
      });
      p.catch(() => { delete cacheUF.current[dentro]; }); // permite tentar de novo
      cacheUF.current[dentro] = p;
    }
    const sigla = dentro;
    cacheUF.current[sigla]
      .then((r) => { if (vivo) setMun({ sigla, ...r, erro: null }); })
      .catch((e) => { if (vivo && !ignoravel(e)) setMun({ sigla, paths: null, dados: null, erro: e.message }); });
    return () => { vivo = false; };
  }, [dentro]);

  // nova escolha (aqui ou em outra aba): leva até a ficha (município) ou até o mapa (estado)
  const r = ficha.r && ficha.r.tipo === explorar.tipo && String(ficha.r.codigo) === String(explorar.codigo) ? ficha.r : null;
  useEffect(() => {
    if (app.pedidoExplorar <= visto.current) return;
    if (explorar.tipo === "municipio" && !r) return; // espera a ficha para saber onde ela fica
    visto.current = app.pedidoExplorar;
    const destino = explorar.tipo === "uf" ? posicoes.current.mapa : posicoes.current.ficha;
    const t = setTimeout(() => scroll.current && scroll.current.scrollTo({ y: Math.max(0, destino - 8), animated: true }), 60);
    return () => clearTimeout(t);
  }, [app.pedidoExplorar, r, explorar.tipo]);

  const tocaUF = useCallback((sigla) => {
    const u = estados[sigla];
    if (u) escolhe({ tipo: "uf", codigo: u.codigo, nome: u.nome, uf: u.codigo });
  }, [estados, escolhe]);

  const tocaMun = useCallback((cod) => {
    if (!mun || !mun.dados) return;
    const m = mun.dados[cod];
    if (m) escolhe({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: mun.sigla });
  }, [mun, escolhe]);

  const M = METRICAS[metrica];
  const munPronto = mun && mun.paths && mun.sigla === dentro ? mun : null;

  // os 3 maiores da região: a leitura do mapa em texto (e o alvo fácil para estados pequenos)
  const top = useMemo(() => Object.values(estados)
    .filter((u) => u[M.campoUF] != null && (!regiao || u.regiao === regiao))
    .sort((a, b) => b[M.campoUF] - a[M.campoUF]).slice(0, 3), [estados, regiao, M]);

  // municípios ranqueados pela métrica do mapa (a posição é a do estado, mesmo filtrando)
  const ranking = useMemo(() => {
    if (!munPronto) return [];
    const campo = M.campoMun;
    return [...munPronto.lista].sort((a, b) => {
      if (a[campo] == null) return 1;
      if (b[campo] == null) return -1;
      return b[campo] - a[campo] || b.populacao - a.populacao;
    }).map((x, i) => ({ ...x, pos: i + 1, chave: semAcento(x.nome) })); // nome sem acento pronto para o filtro
  }, [munPronto, M]);
  const encontrados = useMemo(() => {
    const termo = semAcento(filtro.trim());
    return termo ? ranking.filter((x) => x.chave.includes(termo)) : ranking;
  }, [ranking, filtro]);
  const mostrados = encontrados.slice(0, limiteMun);

  // faixa da legenda
  let min = "", max = "";
  if (dentro && munPronto) {
    if (metrica === "oportunidade") { min = "0"; max = "100"; } else {
      const vals = munPronto.lista.map((x) => x.inst_por_mil_hab).filter((v) => v != null);
      if (vals.length) { min = M.valor(Math.min(...vals)); max = M.valor(Math.max(...vals)); }
    }
  } else if (!dentro) {
    const vals = Object.values(estados).map((u) => u[M.campoUF]).filter((v) => v != null);
    if (vals.length) { min = M.valor(Math.min(...vals)); max = M.valor(Math.max(...vals)); }
  }

  // leitura do mapa: o que está aberto, ou a dica de toque
  let leitura = dentro ? "Toque num município para abrir a ficha." : "Toque num estado para ver os municípios.";
  if (dentro && munPronto && explorar.tipo === "municipio" && munPronto.dados[explorar.codigo]) {
    const m = munPronto.dados[explorar.codigo], v = m[M.campoMun];
    leitura = m.nome + " · " + M.nome + ": " + (v == null ? "sem dado" : M.valor(v));
  } else if (!dentro) {
    const sigla = explorar.tipo === "uf" ? explorar.codigo : explorar.uf;
    const u = estados[sigla];
    if (u && (!regiao || u.regiao === regiao)) {
      const v = u[M.campoUF];
      leitura = u.nome + " · " + M.nome + ": " + (v == null ? "sem dado" : M.valor(v)) + ". " + leitura;
    }
  }

  const regiaoNome = (REGIOES.find((x) => x.valor === regiao) || REGIOES[0]).titulo;
  const nomeDentro = dentro && estados[dentro] ? estados[dentro].nome : dentro;

  return (
    <Tela refScroll={scroll}>
      <Txt variante="titulo" accessibilityRole="header" style={{ marginTop: 16, marginBottom: 16 }}>Explorar</Txt>
      <CampoBusca valor={busca.q} aoMudar={busca.setQ} aoEnviar={() => busca.itens[0] && escolhe(busca.itens[0])} />
      <Resultados busca={busca} aoEscolher={escolhe} />
      {!busca.ativa ? (
        <View style={{ marginTop: 12 }}>
          <Recentes recentes={app.recentes} atual={explorar} aoEscolher={escolhe} />
        </View>
      ) : null}

      {/* ---------- Mapa ---------- */}
      <View onLayout={(e) => { posicoes.current.mapa = e.nativeEvent.layout.y; }}>
        <Secao
          titulo={dentro ? null : "Estados"}
          style={{ marginTop: 28 }}
        >
          {dentro ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <BotaoTexto titulo="‹ Brasil" onPress={() => setDentro(null)} accessibilityLabel="Voltar ao mapa do Brasil" />
              <Txt variante="secao" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>{nomeDentro}</Txt>
            </View>
          ) : null}

          <Segmentado
            opcoes={[{ valor: "oportunidade", titulo: "Oportunidade" }, { valor: "adocao", titulo: "Adoção" }]}
            valor={metrica}
            aoMudar={(m) => { setMetrica(m); setLimiteMun(PASSO_MUN); }}
          />

          {!dentro ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {REGIOES.map((g) => <Chip key={g.titulo} titulo={g.titulo} ativo={regiao === g.valor} onPress={() => setRegiao(g.valor)} />)}
            </View>
          ) : null}

          <View style={{ marginTop: 12 }}>
            {Object.keys(estados).length ? (
              <MapaBrasil
                estados={estados}
                metrica={metrica}
                regiao={regiao}
                dentro={dentro}
                municipios={munPronto}
                marcadoUF={explorar.tipo === "uf" ? explorar.codigo : explorar.uf}
                marcadoMun={explorar.tipo === "municipio" ? explorar.codigo : null}
                aoTocarUF={tocaUF}
                aoTocarMun={tocaMun}
              />
            ) : <Carregando texto="Carregando o mapa…" />}
            {dentro && mun && !mun.paths && !mun.erro ? <Carregando texto="Carregando municípios…" /> : null}
          </View>

          <Txt variante="fraco" style={{ marginTop: 8, textAlign: "center" }} accessibilityLiveRegion="polite">{leitura}</Txt>

          {min ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
              <Txt variante="legenda">{min}</Txt>
              <View style={{ flex: 1, height: 8, borderRadius: 4, overflow: "hidden", flexDirection: "row" }}>
                <Rampa metrica={metrica} />
              </View>
              <Txt variante="legenda">{max}</Txt>
            </View>
          ) : null}
          <Txt variante="legenda" style={{ marginTop: 8 }}>{dentro ? M.legendaMun : M.legenda}</Txt>

          {!dentro ? (
            <View style={{ marginTop: 16 }}>
              <Txt variante="rotulo">{"Maior " + M.nome.toLowerCase() + " · " + regiaoNome}</Txt>
              {top.map((u, i) => (
                <ItemLista key={u.codigo} posicao={i + 1} nome={u.nome} valor={M.valor(u[M.campoUF])}
                  onPress={() => tocaUF(u.codigo)} />
              ))}
            </View>
          ) : (
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Txt variante="forte">{"Municípios de " + nomeDentro}</Txt>
                {munPronto ? <Txt variante="legenda">{numero(munPronto.lista.length) + " municípios"}</Txt> : null}
              </View>
              {mun && mun.erro ? <Aviso tipo="erro">{mun.erro}</Aviso> : null}
              {munPronto ? (
                <>
                  <View style={{ marginTop: -8 }}>
                    <Campo rotulo="Filtrar por nome" value={filtro} placeholder="Nome do município"
                      onChangeText={(t) => { setFiltro(t); setLimiteMun(PASSO_MUN); }} autoCorrect={false} />
                  </View>
                  {!encontrados.length ? <Txt variante="fraco" style={{ paddingVertical: 12 }}>Nenhum município com esse nome.</Txt> : null}
                  {mostrados.map((x) => (
                    <ItemLista key={x.codigo} posicao={x.pos} nome={x.nome}
                      valor={x[M.campoMun] == null ? "sem dado" : M.valor(x[M.campoMun])}
                      onPress={() => escolhe({ tipo: "municipio", codigo: x.codigo, nome: x.nome, uf: dentro })} />
                  ))}
                  <MaisMenos
                    mais={mostrados.length < encontrados.length}
                    menos={limiteMun > PASSO_MUN && mostrados.length > PASSO_MUN}
                    aoMais={() => setLimiteMun((l) => l + 20)}
                    aoMenos={() => {
                      setLimiteMun(PASSO_MUN);
                      scroll.current && scroll.current.scrollTo({ y: posicoes.current.mapa, animated: true });
                    }}
                  />
                </>
              ) : null}
            </View>
          )}
        </Secao>
      </View>

      {/* ---------- Ficha ---------- */}
      <View onLayout={(e) => { posicoes.current.ficha = e.nativeEvent.layout.y; }}>
        {ficha.erro ? <Aviso tipo="erro" style={{ marginTop: 32 }}>{ficha.erro}</Aviso> : null}
        {!r && !ficha.erro ? <Carregando texto={"Carregando " + rotulo(explorar) + "…"} /> : null}
        {r ? <Ficha r={r} metricasML={metricasML} fonte={fonte} /> : null}
      </View>
    </Tela>
  );
}

// Faixa de cor da legenda (os mesmos tons do mapa)
function Rampa({ metrica }) {
  const c = useCores();
  const tons = useMemo(() => {
    const tom = rampa(c.track, metrica === "oportunidade" ? c.amber : c.petrol);
    return Array.from({ length: 12 }, (_, i) => tom(i / 11));
  }, [c, metrica]);
  return tons.map((cor, i) => <View key={i} style={{ flex: 1, backgroundColor: cor }} />);
}
