// Rankings: onde vender. Municípios (mais clientes em potencial, menos exploradas, onde já se vende mais, com filtros)
// e estados (mais clientes, no total ou por domicílio)
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api, ignoravel } from "../../lib/api";
import { useApp, useLocais } from "../../lib/estado";
import { compacto, numero, texto } from "../../lib/fmt";
import { COM_RESSALVAS, ESTADOS_CLIENTES, MAIS_CLIENTES, MENOS_EXPLORADAS, ONDE_JA_SE_VENDE, RESSALVA } from "../../lib/textos";
import Seletor from "../../components/Seletor";
import { Aviso, Carregando, Chip, ItemLista, ListaRanking, MaisMenos, Secao, Segmentado, Tela, Txt } from "../../components/ui";

const PASSO = 5, MAXIMO = 50, MAXIMO_ESTADOS = 27;
const PORTES = [
  { valor: "100000", titulo: "Acima de 100 mil hab." },
  { valor: "50000", titulo: "Acima de 50 mil hab." },
  { valor: "20000", titulo: "Acima de 20 mil hab." },
  { valor: "0", titulo: "Todos os portes" },
];
const ABAS = [{ valor: "municipios", titulo: "Municípios" }, { valor: "estados", titulo: "Estados" }];
// "Onde já se vende mais" fica por último: não é oportunidade
const ORDENS = [
  { valor: "espaco", titulo: "Mais clientes em potencial", legenda: MAIS_CLIENTES },
  { valor: "oportunidade", titulo: "Menos exploradas", legenda: MENOS_EXPLORADAS },
  { valor: "adocao", titulo: "Onde já se vende mais", legenda: ONDE_JA_SE_VENDE },
];
const ORDENS_ESTADOS = [{ valor: "absoluto", titulo: "Mais clientes" }, { valor: "relativo", titulo: "Mais clientes por domicílio" }];

// Lista paginada de 5 em 5. Quem chama dá uma key com a consulta: filtro novo remonta a lista e volta aos 5 primeiros.
// "Ver menos" só recolhe a lista já carregada; "fim" lembra que a API não tinha mais itens.
function usePaginada(consulta, maximo, aoErro) {
  const [limite, setLimite] = useState(PASSO);
  const [carga, setCarga] = useState({ itens: null, fim: false });
  const controle = useRef(null);
  const { itens, fim } = carga;

  useEffect(() => {
    if (itens && (fim || itens.length >= limite)) return undefined; // já tem o suficiente
    if (controle.current) controle.current.abort();
    controle.current = new AbortController();
    api(consulta + "&limite=" + limite, { signal: controle.current.signal })
      .then((lista) => setCarga({ itens: lista, fim: lista.length < limite }))
      .catch((e) => { if (!ignoravel(e)) aoErro(e.message); });
    return () => controle.current && controle.current.abort();
  }, [consulta, limite]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostrados = itens ? itens.slice(0, limite) : null;
  const pagina = {
    mais: !!itens && (itens.length > limite || (!fim && itens.length >= limite && limite < maximo)),
    menos: limite > PASSO && !!itens && itens.length > PASSO,
    aoMais: () => setLimite((l) => Math.min(l + PASSO, maximo)),
    aoMenos: () => setLimite(PASSO),
  };
  return { itens, mostrados, pagina };
}

function ListaMunicipios({ consulta, tipo, ressalvas, aoAbrir, aoErro }) {
  const { itens, mostrados, pagina } = usePaginada(consulta, MAXIMO, aoErro);

  if (!itens) return <Carregando />;
  if (!itens.length) return <Txt variante="fraco" style={{ paddingVertical: 12 }}>Nenhum município com esses filtros.</Txt>;

  return (
    <View>
      <ListaRanking itens={mostrados} criterio={tipo} ressalvas={ressalvas ? COM_RESSALVAS : null}
        aoAbrir={(m) => aoAbrir({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf })} />
      <MaisMenos {...pagina} />
    </View>
  );
}

function ListaEstados({ ordem, aoAbrir, aoErro }) {
  const { itens, mostrados, pagina } = usePaginada("/rankings/estados?ordem=" + ordem, MAXIMO_ESTADOS, aoErro);

  if (!itens) return <Carregando />;
  if (!itens.length) return <Txt variante="fraco" style={{ paddingVertical: 12 }}>Nenhum estado com clientes em potencial.</Txt>;

  const relativo = ordem === "relativo";
  return (
    <View>
      {mostrados.map((u) => (
        <ItemLista
          key={u.codigo}
          posicao={u.posicao}
          nome={u.nome}
          meta={u.manchete}
          valor={relativo
            ? (u.por_mil_domicilios != null ? numero(u.por_mil_domicilios, 1) + " por mil dom." : "–")
            : texto(compacto(u.espaco)) + " clientes"}
          onPress={() => aoAbrir({ tipo: "uf", codigo: u.codigo, nome: u.nome, uf: u.codigo })}
        />
      ))}
      <MaisMenos {...pagina} />
    </View>
  );
}

export default function Rankings() {
  const router = useRouter();
  const app = useApp();
  const { local, escolhido } = useLocais();
  const params = useLocalSearchParams();
  const [ufs, setUfs] = useState([]);
  const [aba, setAba] = useState("municipios");
  const [ordem, setOrdem] = useState("espaco");
  const [uf, setUf] = useState("");
  const [porte, setPorte] = useState("50000");
  const [perto, setPerto] = useState(false);
  const [concordam, setConcordam] = useState(false);
  const [todas, setTodas] = useState(false);
  const [ordemEstados, setOrdemEstados] = useState("absoluto");
  const [erro, setErro] = useState(null);

  // vindo do Início (oportunidades perto, selo de posição ou link do estado): aplica os filtros pedidos
  useEffect(() => {
    const veio = [params.uf, params.porte, params.ordem, params.perto].some((p) => p !== undefined);
    if (!veio) return;
    setAba("municipios");
    if (params.uf !== undefined) setUf(String(params.uf).toUpperCase());
    if (params.porte !== undefined && PORTES.some((p) => p.valor === params.porte)) setPorte(params.porte);
    if (params.ordem !== undefined && ORDENS.some((o) => o.valor === params.ordem)) setOrdem(params.ordem);
    if (params.perto !== undefined) setPerto(params.perto === "1");
  }, [params.uf, params.porte, params.ordem, params.perto]);

  useEffect(() => {
    const controle = new AbortController();
    api("/ufs", { signal: controle.signal }).then(setUfs).catch((e) => { if (!ignoravel(e)) setErro(e.message); });
    return () => controle.abort();
  }, []);

  const abre = (l) => { app.escolheExplorar(l); router.navigate("/explorar"); };
  const opcoesUF = [{ valor: "", titulo: "Todos os estados" }, ...ufs.map((u) => ({ valor: u.codigo, titulo: u.nome }))];

  // "Perto da minha base" só vale com uma cidade-base escolhida
  const podePerto = escolhido && local.tipo === "municipio";
  const pertoAtivo = perto && podePerto;
  let consulta = "/rankings?tipo=" + ordem + "&pop_min=" + porte + (uf ? "&uf=" + uf : "");
  if (pertoAtivo) consulta += "&base=" + encodeURIComponent(local.codigo) + "&raio_km=" + app.raio;
  if (concordam) consulta += "&concordam=true";
  if (ordem === "espaco" && todas) consulta += "&todas=true";
  const ordemAtual = ORDENS.find((o) => o.valor === ordem) || ORDENS[0];

  const trocaAba = (a) => { setErro(null); setAba(a); };

  return (
    <Tela>
      <Txt variante="titulo" accessibilityRole="header" style={{ marginTop: 16 }}>Rankings</Txt>
      <View style={{ marginTop: 16 }}>
        <Segmentado opcoes={ABAS} valor={aba} aoMudar={trocaAba} />
      </View>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {aba === "municipios" ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {ORDENS.map((o) => (
              <Chip key={o.valor} titulo={o.titulo} ativo={ordem === o.valor} onPress={() => { setErro(null); setOrdem(o.valor); }} />
            ))}
          </View>
          {ordem === "adocao" ? <Txt variante="fraco" style={{ marginTop: 8 }}>{ONDE_JA_SE_VENDE}</Txt> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Seletor rotulo="Estado" opcoes={opcoesUF} valor={uf} aoMudar={setUf} style={{ flex: 1 }} />
            <Seletor rotulo="Porte do município" opcoes={PORTES} valor={porte} aoMudar={setPorte} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {podePerto ? (
              <Chip titulo={"Perto da minha base (" + app.raio + " km)"} ativo={pertoAtivo}
                onPress={() => { setErro(null); setPerto((p) => !p); }} />
            ) : null}
            <Chip titulo="Confirmado por 2 modelos" ativo={concordam} onPress={() => setConcordam((v) => !v)} />
            {ordem === "espaco" ? (
              <Chip titulo="Incluir cidades com ressalvas" ativo={todas} onPress={() => setTodas((v) => !v)} />
            ) : null}
          </View>
          {pertoAtivo ? (
            <Txt variante="legenda" style={{ marginTop: 8 }}>
              {"Até " + app.raio + " km de " + local.nome + ", " + local.uf + ". O raio muda no Início."}
            </Txt>
          ) : null}

          <Secao titulo={ordemAtual.titulo} style={{ marginTop: 20 }}>
            <ListaMunicipios key={consulta} consulta={consulta} tipo={ordem} ressalvas={ordem === "espaco" && !todas}
              aoAbrir={abre} aoErro={setErro} />
          </Secao>

          {ordem !== "adocao" ? (
            <Txt variante="legenda" style={{ marginTop: 24 }}>{ordemAtual.legenda + " " + RESSALVA}</Txt>
          ) : null}
        </>
      ) : (
        <>
          <View style={{ marginTop: 16 }}>
            <Segmentado opcoes={ORDENS_ESTADOS} valor={ordemEstados} aoMudar={setOrdemEstados} />
          </View>
          <Secao titulo="Estados com mais clientes em potencial" style={{ marginTop: 20 }}>
            <ListaEstados key={ordemEstados} ordem={ordemEstados} aoAbrir={abre} aoErro={setErro} />
          </Secao>
          <Txt variante="legenda" style={{ marginTop: 24 }}>{ESTADOS_CLIENTES + " " + RESSALVA}</Txt>
        </>
      )}
    </Tela>
  );
}
