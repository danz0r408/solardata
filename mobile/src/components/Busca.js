// Busca única de estado ou município (a mesma do site): resultados agrupados, com espera curta entre teclas
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { api, ignoravel } from "../lib/api";
import { useCores } from "../lib/estado";
import { rotulo } from "../lib/fmt";
import { FONTE, RAIO, T } from "../lib/tema";
import { Txt } from "./ui";

export function useBusca() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState({ itens: [], erro: null, buscando: false });
  const controle = useRef(null);

  useEffect(() => {
    const termo = q.trim();
    if (controle.current) controle.current.abort();
    if (termo.length < 2) { setRes({ itens: [], erro: null, buscando: false }); return undefined; }
    setRes((r) => ({ ...r, buscando: true }));
    const timer = setTimeout(() => {
      controle.current = new AbortController();
      api("/busca?q=" + encodeURIComponent(termo), { signal: controle.current.signal })
        .then((itens) => setRes({ itens, erro: null, buscando: false }))
        .catch((e) => { if (!ignoravel(e)) setRes({ itens: [], erro: e.message, buscando: false }); });
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => () => controle.current && controle.current.abort(), []);
  return { q, setQ, ...res, ativa: q.trim().length >= 2 };
}

export function CampoBusca({ valor, aoMudar, placeholder = "Busque uma cidade ou estado", autoFocus, aoEnviar }) {
  const c = useCores();
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: c.line, borderRadius: RAIO,
      backgroundColor: c.surface, paddingHorizontal: 12,
    }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth={1.5} strokeLinecap="round">
        <Circle cx={11} cy={11} r={7} />
        <Path d="m20 20-3.5-3.5" />
      </Svg>
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        onSubmitEditing={aoEnviar}
        accessibilityLabel="Buscar estado ou município"
        style={{ flex: 1, minHeight: 46, fontFamily: FONTE.regular, fontSize: T.md, color: c.ink }}
      />
      {valor ? (
        <Pressable onPress={() => aoMudar("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpar busca">
          <Txt variante="fraco">Limpar</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Resultados({ busca, aoEscolher }) {
  const c = useCores();
  if (!busca.ativa) return null;
  if (busca.erro) return <Txt variante="fraco" style={{ paddingVertical: 12 }}>{busca.erro}</Txt>;
  if (!busca.itens.length) {
    return <Txt variante="fraco" style={{ paddingVertical: 12 }}>{busca.buscando ? "Buscando…" : "Nenhum estado ou município encontrado."}</Txt>;
  }
  const grupos = busca.itens.some((i) => i.tipo === "uf") && busca.itens.some((i) => i.tipo !== "uf");
  const linhas = [];
  let anterior = null;
  busca.itens.forEach((it) => {
    if (grupos && it.tipo !== anterior) {
      linhas.push(
        <Txt key={"g" + it.tipo} variante="rotulo" style={{ marginTop: 14, marginBottom: 2 }}>
          {it.tipo === "uf" ? "Estados" : "Municípios"}
        </Txt>,
      );
      anterior = it.tipo;
    }
    linhas.push(
      <Pressable
        key={it.tipo + it.codigo}
        accessibilityRole="button"
        onPress={() => { busca.setQ(""); aoEscolher(it); }}
        style={({ pressed }) => ({
          flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 13,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1,
        })}
      >
        <Txt style={{ fontFamily: FONTE.media, flex: 1 }} numberOfLines={1}>{rotulo(it)}</Txt>
        <Txt variante="legenda">{it.tipo === "uf" ? "Estado" : "Município · " + it.uf}</Txt>
      </Pressable>,
    );
  });
  return <View style={{ marginTop: 4 }}>{linhas}</View>;
}

// Consultas recentes em botões; o local aberto fica marcado
export function Recentes({ recentes, atual, aoEscolher }) {
  const c = useCores();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {recentes.map((l) => {
        const ativo = !!atual && l.tipo === atual.tipo && String(l.codigo) === String(atual.codigo);
        return (
          <Pressable
            key={l.tipo + l.codigo}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
            onPress={() => aoEscolher(l)}
            style={({ pressed }) => ({
              paddingHorizontal: 12, minHeight: 34, justifyContent: "center", borderRadius: 999, borderWidth: 1,
              borderColor: ativo ? c.petrol : c.line, backgroundColor: pressed ? c.track : c.surface,
            })}
          >
            <Txt style={{ fontSize: T.sm, fontFamily: ativo ? FONTE.forte : FONTE.regular, color: ativo ? c.petrol : c.ink }}>{rotulo(l)}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
