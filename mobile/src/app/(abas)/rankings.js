// Rankings: onde vender. Municípios (mais espaço, maior IPNE, maior adoção, com filtros) e estados (espaço total ou por mil domicílios)
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api, ignoravel } from "../../lib/api";
import { useApp, useLocais } from "../../lib/estado";
import { compacto, numero, potencia, texto } from "../../lib/fmt";
import { ESPERADO_PERFIL, ESTADOS_ESPACO, MAIOR_ADOCAO, MAIOR_IPNE, MAIS_ESPACO, RESSALVA, SELOS } from "../../lib/textos";
import Seletor from "../../components/Seletor";
import { Aviso, Carregando, Chip, ItemEspaco, ItemLista, MaisMenos, Secao, Segmentado, Tela, Txt } from "../../components/ui";

const PASSO = 5, MAXIMO = 50, MAXIMO_ESTADOS = 27;
const PORTES = [
  { valor: "100000", titulo: "Acima de 100 mil hab." },
  { valor: "50000", titulo: "Acima de 50 mil hab." },
  { valor: "20000", titulo: "Acima de 20 mil hab." },
  { valor: "0", titulo: "Todos os portes" },
];
const ABAS = [{ valor: "municipios", titulo: "Municípios" }, { valor: "estados", titulo: "Estados" }];
const ORDENS = [
  { valor: "espaco", titulo: "Mais espaço", legenda: MAIS_ESPACO },
  { valor: "oportunidade", titulo: "Maior IPNE", legenda: MAIOR_IPNE },
  { valor: "adocao", titulo: "Maior adoção", legenda: MAIOR_ADOCAO },
];
const ORDENS_ESTADOS = [{ valor: "absoluto", titulo: "Total" }, { valor: "relativo", titulo: "Por mil domicílios" }];

// Lista paginada de 5 em 5. Quem chama dá uma key com a consulta: filtro novo remonta a lista e volta aos 5 primeiros.
function usePaginada(consulta, aoErro) {
  const [limite, setLimite] = useState(PASSO);
  const [itens, setItens] = useState(null);
  const controle = useRef(null);

  useEffect(() => {
    if (controle.current) controle.current.abort();
    controle.current = new AbortController();
    api(consulta + "&limite=" + limite, { signal: controle.current.signal })
      .then(setItens)
      .catch((e) => { if (!ignoravel(e)) aoErro(e.message); });
    return () => controle.current && controle.current.abort();
  }, [consulta, limite]); // eslint-disable-line react-hooks/exhaustive-deps

  return { limite, setLimite, itens, setItens };
}

function ListaMunicipios({ consulta, tipo, aoAbrir, aoErro }) {
  const { limite, setLimite, itens, setItens } = usePaginada(consulta, aoErro);

  if (!itens) return <Carregando />;
  if (!itens.length) return <Txt variante="fraco" style={{ paddingVertical: 12 }}>Nenhum município com esses filtros.</Txt>;

  // "Ver menos" recolhe na hora: os 5 primeiros já estão na lista
  const mostrados = itens.slice(0, limite);
  const abre = (m) => aoAbrir({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf });
  return (
    <View>
      {mostrados.map((m) => (tipo === "adocao" ? (
        <ItemLista
          key={m.codigo}
          posicao={m.posicao}
          nome={m.nome + ", " + m.uf}
          meta={texto(potencia(m.potencia_kw)) + " instalados" + (m.distancia_km != null ? " · " + m.distancia_km + " km" : "")}
          valor={texto(compacto(m.instalacoes))}
          onPress={() => abre(m)}
        />
      ) : <ItemEspaco key={m.codigo} m={m} onPress={() => abre(m)} />))}
      <MaisMenos
        mais={itens.length >= limite && limite < MAXIMO}
        menos={limite > PASSO && itens.length > PASSO}
        aoMais={() => setLimite((l) => Math.min(l + PASSO, MAXIMO))}
        aoMenos={() => { setLimite(PASSO); setItens((v) => v.slice(0, PASSO)); }}
      />
    </View>
  );
}

function ListaEstados({ ordem, aoAbrir, aoErro }) {
  const { limite, setLimite, itens, setItens } = usePaginada("/rankings/estados?ordem=" + ordem, aoErro);

  if (!itens) return <Carregando />;
  if (!itens.length) return <Txt variante="fraco" style={{ paddingVertical: 12 }}>Nenhum estado com espaço estimado.</Txt>;

  const mostrados = itens.slice(0, limite);
  return (
    <View>
      {mostrados.map((u) => (
        <ItemLista
          key={u.codigo}
          posicao={u.posicao}
          nome={u.nome}
          meta={u.manchete + (ordem === "relativo" && u.por_mil_domicilios != null
            ? " · " + numero(u.por_mil_domicilios, 1) + " por mil domicílios" : "")}
          onPress={() => aoAbrir({ tipo: "uf", codigo: u.codigo, nome: u.nome, uf: u.codigo })}
        />
      ))}
      <MaisMenos
        mais={itens.length >= limite && limite < MAXIMO_ESTADOS}
        menos={limite > PASSO && itens.length > PASSO}
        aoMais={() => setLimite((l) => Math.min(l + PASSO, MAXIMO_ESTADOS))}
        aoMenos={() => { setLimite(PASSO); setItens((v) => v.slice(0, PASSO)); }}
      />
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
          <View style={{ marginTop: 16 }}>
            <Segmentado opcoes={ORDENS} valor={ordem} aoMudar={(o) => { setErro(null); setOrdem(o); }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Seletor rotulo="Estado" opcoes={opcoesUF} valor={uf} aoMudar={setUf} style={{ flex: 1 }} />
            <Seletor rotulo="Porte do município" opcoes={PORTES} valor={porte} aoMudar={setPorte} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {podePerto ? (
              <Chip titulo={"Perto da minha base (" + app.raio + " km)"} ativo={pertoAtivo}
                onPress={() => { setErro(null); setPerto((p) => !p); }} />
            ) : null}
            <Chip titulo="IPNE e ML concordam" ativo={concordam} onPress={() => setConcordam((v) => !v)} />
          </View>
          {pertoAtivo ? (
            <Txt variante="legenda" style={{ marginTop: 8 }}>
              {"Até " + app.raio + " km de " + local.nome + ", " + local.uf + ". O raio muda no Início."}
            </Txt>
          ) : null}

          <Secao titulo={ordemAtual.titulo} style={{ marginTop: 20 }}>
            <ListaMunicipios key={consulta} consulta={consulta} tipo={ordem} aoAbrir={abre} aoErro={setErro} />
          </Secao>

          <Txt variante="legenda" style={{ marginTop: 24 }}>
            {ordemAtual.legenda + (ordem === "adocao" ? "" : " " + SELOS + " " + ESPERADO_PERFIL) + " " + RESSALVA}
          </Txt>
        </>
      ) : (
        <>
          <View style={{ marginTop: 16 }}>
            <Segmentado opcoes={ORDENS_ESTADOS} valor={ordemEstados} aoMudar={setOrdemEstados} />
          </View>
          <Secao titulo="Estados com mais espaço" style={{ marginTop: 20 }}>
            <ListaEstados key={ordemEstados} ordem={ordemEstados} aoAbrir={abre} aoErro={setErro} />
          </Secao>
          <Txt variante="legenda" style={{ marginTop: 24 }}>{ESTADOS_ESPACO + " " + ESPERADO_PERFIL + " " + RESSALVA}</Txt>
        </>
      )}
    </Tela>
  );
}
