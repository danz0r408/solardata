// Escolher a "minha cidade" do Início: busca, recentes e os municípios com maior oportunidade.
// Logo depois do cadastro (?primeira=1) abre como "Onde fica sua base?", com a opção de pular.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api, ignoravel } from "../lib/api";
import { useApp, useCores, useLocais } from "../lib/estado";
import { FONTE } from "../lib/tema";
import { CampoBusca, Recentes, Resultados, useBusca } from "../components/Busca";
import { Tela, Txt } from "../components/ui";

export default function EscolherLocal() {
  const router = useRouter();
  const app = useApp();
  const { local } = useLocais();
  const c = useCores();
  const busca = useBusca();
  const { primeira } = useLocalSearchParams();
  const primeiraVez = primeira === "1";
  const [sugestoes, setSugestoes] = useState([]);

  useEffect(() => {
    const controle = new AbortController();
    api("/rankings?tipo=oportunidade&pop_min=100000&limite=5", { signal: controle.signal })
      .then(setSugestoes)
      .catch((e) => { if (!ignoravel(e)) setSugestoes([]); });
    return () => controle.abort();
  }, []);

  const escolhe = (l) => {
    app.escolheLocal(l);
    router.back();
  };

  const cabecalho = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 }}>
      <Txt variante="secao" accessibilityRole="header">{primeiraVez ? "Onde fica sua base?" : "Escolher local"}</Txt>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={primeiraVez ? "Pular" : "Fechar"}>
        <Txt variante="link">{primeiraVez ? "Pular" : "Fechar"}</Txt>
      </Pressable>
    </View>
  );

  return (
    <Tela cabecalho={cabecalho} bordas={["top", "bottom"]}>
      {primeiraVez ? (
        <Txt variante="fraco" style={{ marginBottom: 12 }}>
          A cidade de onde você atende. O Início mostra os municípios com mais espaço para vender perto dela.
        </Txt>
      ) : null}
      <CampoBusca valor={busca.q} aoMudar={busca.setQ} placeholder="Digite um município ou estado" autoFocus
        aoEnviar={() => busca.itens[0] && escolhe(busca.itens[0])} />
      <Resultados busca={busca} aoEscolher={escolhe} />
      {!busca.ativa ? (
        <>
          <Txt variante="rotulo" style={{ marginTop: 24, marginBottom: 10 }}>Recentes</Txt>
          <Recentes recentes={app.recentes} atual={local} aoEscolher={escolhe} />
          {sugestoes.length ? <Txt variante="rotulo" style={{ marginTop: 24, marginBottom: 2 }}>Maior oportunidade</Txt> : null}
          {sugestoes.map((m) => (
            <Pressable
              key={m.codigo}
              accessibilityRole="button"
              onPress={() => escolhe({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf })}
              style={({ pressed }) => ({
                flexDirection: "row", justifyContent: "space-between", paddingVertical: 13,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1,
              })}
            >
              <Txt style={{ fontFamily: FONTE.media }}>{m.nome + ", " + m.uf}</Txt>
              <Txt style={{ fontFamily: FONTE.forte, color: c.petrol }}>IPNE {m.ipne}</Txt>
            </Pressable>
          ))}
        </>
      ) : null}
    </Tela>
  );
}
