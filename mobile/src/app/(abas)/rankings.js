// Rankings: maior oportunidade (IPNE) e maior adoção, com filtro de estado e porte
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api, ignoravel } from "../../lib/api";
import { useApp, useCores } from "../../lib/estado";
import { compacto, potencia, texto } from "../../lib/fmt";
import { ESPERADO_PERFIL, RESSALVA } from "../../lib/textos";
import Seletor from "../../components/Seletor";
import { Aviso, Carregando, ItemLista, MaisMenos, Secao, Tela, Txt } from "../../components/ui";

const PASSO = 5, MAXIMO = 50;
const PORTES = [
  { valor: "100000", titulo: "Acima de 100 mil hab." },
  { valor: "50000", titulo: "Acima de 50 mil hab." },
  { valor: "20000", titulo: "Acima de 20 mil hab." },
  { valor: "0", titulo: "Todos os portes" },
];

function Lista({ tipo, uf, porte, aoAbrir, aoErro }) {
  const c = useCores();
  const [limite, setLimite] = useState(PASSO);
  const [itens, setItens] = useState(null);
  const controle = useRef(null);

  // filtro mudou: volta para os 5 primeiros
  useEffect(() => { setLimite(PASSO); }, [uf, porte]);

  useEffect(() => {
    if (controle.current) controle.current.abort();
    controle.current = new AbortController();
    const params = "?tipo=" + tipo + "&limite=" + limite + "&pop_min=" + porte + (uf ? "&uf=" + uf : "");
    api("/rankings" + params, { signal: controle.current.signal })
      .then(setItens)
      .catch((e) => { if (!ignoravel(e)) aoErro(e.message); });
    return () => controle.current && controle.current.abort();
  }, [tipo, uf, porte, limite]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!itens) return <Carregando />;
  if (!itens.length) return <Txt variante="fraco" style={{ paddingVertical: 12 }}>Nenhum município com esses filtros.</Txt>;

  // "Ver menos" recolhe na hora: os 5 primeiros já estão na lista
  const mostrados = itens.slice(0, limite);
  return (
    <View>
      {mostrados.map((m) => (
        <ItemLista
          key={m.codigo}
          posicao={m.posicao}
          nome={m.nome + ", " + m.uf}
          meta={tipo === "oportunidade"
            ? m.manchete + " · " + texto(compacto(m.populacao)) + " hab."
            : texto(potencia(m.potencia_kw)) + " instalados"}
          valor={tipo === "oportunidade" ? String(m.ipne) : texto(compacto(m.instalacoes))}
          barra={tipo === "oportunidade" ? m.ipne : null}
          corBarra={c.amber}
          onPress={() => aoAbrir({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf })}
        />
      ))}
      <MaisMenos
        mais={itens.length >= limite && limite < MAXIMO}
        menos={limite > PASSO && itens.length > PASSO}
        aoMais={() => setLimite((l) => Math.min(l + PASSO, MAXIMO))}
        aoMenos={() => { setLimite(PASSO); setItens((v) => v.slice(0, PASSO)); }}
      />
    </View>
  );
}

export default function Rankings() {
  const router = useRouter();
  const app = useApp();
  const params = useLocalSearchParams();
  const [ufs, setUfs] = useState([]);
  const [uf, setUf] = useState("");
  const [porte, setPorte] = useState("50000");
  const [erro, setErro] = useState(null);

  // vindo do Início (selo de posição ou link do estado): aplica os filtros pedidos
  useEffect(() => {
    if (params.uf !== undefined) setUf(String(params.uf).toUpperCase());
    if (params.porte !== undefined && PORTES.some((p) => p.valor === params.porte)) setPorte(params.porte);
  }, [params.uf, params.porte]);

  useEffect(() => {
    const controle = new AbortController();
    api("/ufs", { signal: controle.signal }).then(setUfs).catch((e) => { if (!ignoravel(e)) setErro(e.message); });
    return () => controle.abort();
  }, []);

  const abre = (l) => { app.escolheExplorar(l); router.navigate("/explorar"); };
  const opcoesUF = [{ valor: "", titulo: "Todos os estados" }, ...ufs.map((u) => ({ valor: u.codigo, titulo: u.nome }))];

  return (
    <Tela>
      <Txt variante="titulo" accessibilityRole="header" style={{ marginTop: 16 }}>Rankings</Txt>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
        <Seletor rotulo="Estado" opcoes={opcoesUF} valor={uf} aoMudar={setUf} style={{ flex: 1 }} />
        <Seletor rotulo="Porte do município" opcoes={PORTES} valor={porte} aoMudar={setPorte} style={{ flex: 1 }} />
      </View>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Secao titulo="Maior oportunidade">
        <Lista tipo="oportunidade" uf={uf} porte={porte} aoAbrir={abre} aoErro={setErro} />
      </Secao>
      <Secao titulo="Maior adoção">
        <Lista tipo="adocao" uf={uf} porte={porte} aoAbrir={abre} aoErro={setErro} />
      </Secao>

      <Txt variante="legenda" style={{ marginTop: 24 }}>
        {"Maior oportunidade: municípios com mais espaço para crescer em relação ao esperado pelo perfil (IPNE). " +
          ESPERADO_PERFIL + " " + RESSALVA}
      </Txt>
    </Tela>
  );
}
