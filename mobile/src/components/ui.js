// Peças de interface compartilhadas pelas telas (equivalentes às classes do styles.css do site)
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useCores } from "../lib/estado";
import { compacto, potencia, texto } from "../lib/fmt";
import { FONTE, GUTTER, RAIO, T } from "../lib/tema";

// Estilos que dependem do tema, recalculados só quando a paleta muda
export function useEstilos(criar) {
  const c = useCores();
  return useMemo(() => StyleSheet.create(criar(c)), [c]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Tela({ children, rolar = true, refScroll, cabecalho, bordas = ["top"] }) {
  const c = useCores();
  return (
    <SafeAreaView edges={bordas} style={{ flex: 1, backgroundColor: c.bg }}>
      {cabecalho}
      {rolar ? (
        <ScrollView
          ref={refScroll}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: GUTTER }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// 16 -> 24, 14 -> 21, 12 -> 18, 20 -> 29, 28 -> 35, 40 -> 49
function alturaLinha(tamanho) { return Math.ceil(tamanho * (tamanho >= 24 ? 1.22 : 1.45)); }

export function Txt({ style, variante = "corpo", children, ...props }) {
  const c = useCores();
  const base = {
    corpo: { fontFamily: FONTE.regular, fontSize: T.md, color: c.ink, lineHeight: 24 },
    forte: { fontFamily: FONTE.forte, fontSize: T.md, color: c.ink },
    fraco: { fontFamily: FONTE.regular, fontSize: T.sm, color: c.muted, lineHeight: 20 },
    legenda: { fontFamily: FONTE.regular, fontSize: T.xs, color: c.muted, lineHeight: 17 },
    titulo: { fontFamily: FONTE.forte, fontSize: T.xl, color: c.ink, letterSpacing: -0.4 },
    secao: { fontFamily: FONTE.forte, fontSize: T.lg, color: c.ink, letterSpacing: -0.2 },
    rotulo: { fontFamily: FONTE.media, fontSize: T.xs, color: c.muted, textTransform: "uppercase", letterSpacing: 0.6 },
    link: { fontFamily: FONTE.media, fontSize: T.sm, color: c.petrol },
  }[variante];
  // A altura da linha acompanha o tamanho final da fonte. Com valor fixo (ex.: 24) num texto de 40px,
  // o iOS corta o topo e a base das letras; no navegador o texto só vaza e o problema não aparece.
  const proprio = StyleSheet.flatten(style) || {};
  const lineHeight = proprio.lineHeight
    || (proprio.fontSize ? alturaLinha(proprio.fontSize) : base.lineHeight || alturaLinha(base.fontSize));
  return <Text style={[base, style, { lineHeight }]} {...props}>{children}</Text>;
}

export function Secao({ titulo, direita, children, style }) {
  return (
    <View style={[{ marginTop: 28 }, style]}>
      {titulo ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Txt variante="secao" accessibilityRole="header">{titulo}</Txt>
          {direita}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Cartao({ children, style }) {
  const c = useCores();
  return (
    <View style={[{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: RAIO, padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function Botao({ titulo, onPress, tipo = "primario", desativado, carregando, style, ...props }) {
  const c = useCores();
  const primario = tipo === "primario";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desativado || !!carregando }}
      onPress={onPress}
      disabled={desativado || carregando}
      style={({ pressed }) => [{
        minHeight: 48, borderRadius: RAIO, alignItems: "center", justifyContent: "center", paddingHorizontal: 16,
        backgroundColor: primario ? (pressed ? c.petrolStrong : c.petrol) : "transparent",
        borderWidth: primario ? 0 : 1, borderColor: c.line,
        opacity: desativado ? 0.5 : pressed && !primario ? 0.7 : 1,
      }, style]}
      {...props}
    >
      {carregando ? <ActivityIndicator color={primario ? c.onPetrol : c.petrol} /> : (
        <Txt style={{ fontFamily: FONTE.forte, color: primario ? c.onPetrol : c.ink, fontSize: T.md }}>{titulo}</Txt>
      )}
    </Pressable>
  );
}

// Botões de texto pequenos ("Ver mais", "Ver menos", "‹ Brasil")
export function BotaoTexto({ titulo, onPress, style, ...props }) {
  const c = useCores();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}
      style={({ pressed }) => [{ paddingVertical: 10, opacity: pressed ? 0.6 : 1 }, style]} {...props}>
      <Txt variante="link" style={{ color: c.petrol }}>{titulo}</Txt>
    </Pressable>
  );
}

export function Chip({ titulo, ativo, onPress }) {
  const c = useCores();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!ativo }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14, minHeight: 36, justifyContent: "center", borderRadius: 999,
        borderWidth: 1, borderColor: ativo ? c.petrol : c.line,
        backgroundColor: ativo ? c.petrol : pressed ? c.track : c.surface,
      })}
    >
      <Txt style={{ fontFamily: FONTE.media, fontSize: T.sm, color: ativo ? c.onPetrol : c.ink }}>{titulo}</Txt>
    </Pressable>
  );
}

// Seletor de duas ou mais opções lado a lado (toggle do site)
export function Segmentado({ opcoes, valor, aoMudar }) {
  const c = useCores();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.track, borderRadius: RAIO, padding: 3 }} accessibilityRole="tablist">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            onPress={() => aoMudar(o.valor)}
            style={{
              flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: RAIO - 2, paddingHorizontal: 6,
              backgroundColor: ativo ? c.surface : "transparent",
            }}
          >
            <Txt style={{ fontFamily: ativo ? FONTE.forte : FONTE.media, fontSize: T.sm, color: ativo ? c.ink : c.muted, textAlign: "center" }}>{o.titulo}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// Linha de ficha: rótulo à esquerda, valor à direita
export function Linha({ rotulo, valor, ultima }) {
  const c = useCores();
  return (
    <View style={{
      flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingVertical: 11,
      borderBottomWidth: ultima ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
    }}>
      <Txt variante="fraco" style={{ flex: 1 }}>{rotulo}</Txt>
      <Txt style={{ fontFamily: FONTE.forte, textAlign: "right", flexShrink: 1 }}>{valor}</Txt>
    </View>
  );
}

export function Aviso({ children, tipo = "info", style }) {
  const c = useCores();
  const erro = tipo === "erro";
  return (
    <View style={[{
      backgroundColor: erro ? c.dangerBg : c.track, borderRadius: RAIO, padding: 12, marginTop: 12,
    }, style]} accessibilityRole={erro ? "alert" : undefined}>
      <Txt variante="fraco" style={{ color: erro ? c.danger : c.ink }}>{children}</Txt>
    </View>
  );
}

export function Carregando({ texto = "Carregando…" }) {
  const c = useCores();
  return (
    <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
      <ActivityIndicator color={c.petrol} />
      <Txt variante="fraco">{texto}</Txt>
    </View>
  );
}

export function Campo({ rotulo, erro, direita, ...props }) {
  const c = useCores();
  return (
    <View style={{ marginTop: 16 }}>
      <Txt variante="fraco" style={{ color: c.ink, fontFamily: FONTE.media, marginBottom: 6 }}>{rotulo}</Txt>
      <View style={{
        flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: erro ? c.danger : c.line,
        borderRadius: RAIO, backgroundColor: c.surface,
      }}>
        <TextInput
          placeholderTextColor={c.faint}
          style={{ flex: 1, minHeight: 48, paddingHorizontal: 14, fontFamily: FONTE.regular, fontSize: T.md, color: c.ink }}
          accessibilityLabel={rotulo}
          {...props}
        />
        {direita}
      </View>
    </View>
  );
}

// Item de lista numerada (top 3 do mapa, municípios do estado, rankings)
export function ItemLista({ posicao, nome, meta, valor, onPress, barra, corBarra }) {
  const c = useCores();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={posicao + ". " + nome + (meta ? ", " + meta : "") + (valor ? ", " + valor : "")}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1,
      })}
    >
      <Txt style={{ width: 28, fontFamily: FONTE.media, color: c.faint, fontSize: T.sm }}>{posicao}</Txt>
      <View style={{ flex: 1 }}>
        <Txt style={{ fontFamily: FONTE.media }} numberOfLines={1}>{nome}</Txt>
        {meta ? <Txt variante="legenda" numberOfLines={2}>{meta}</Txt> : null}
        {barra != null ? (
          <View style={{ height: 4, backgroundColor: c.track, borderRadius: 2, marginTop: 6 }}>
            <View style={{ height: 4, width: Math.max(0, Math.min(100, barra)) + "%", backgroundColor: corBarra || c.amber, borderRadius: 2 }} />
          </View>
        ) : null}
      </View>
      {valor ? <Txt style={{ fontFamily: FONTE.forte, textAlign: "right" }}>{valor}</Txt> : null}
    </Pressable>
  );
}

// Selo pequeno: "Confirmado por 2 modelos" (petróleo), "Modelos discordam" (alerta), "Muitos prédios" (neutro)
export function Selo({ titulo, tom = "neutro" }) {
  const c = useCores();
  const borda = tom === "ipne" ? c.amber : tom === "petrol" ? c.petrol : tom === "alerta" ? c.danger : c.line;
  const cor = tom === "petrol" ? c.petrol : tom === "alerta" ? c.danger : tom === "ipne" ? c.ink : c.muted;
  return (
    <View style={{ borderWidth: 1, borderColor: borda, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Txt style={{ fontFamily: FONTE.media, fontSize: T.xs, color: cor }}>{titulo}</Txt>
    </View>
  );
}

// Selos de um município de ranking. O motivo de "Muitos prédios" fica visível no próprio selo.
export function textoSelos(m) {
  const selos = [];
  if (m.concordam) selos.push({ titulo: "Confirmado por 2 modelos", tom: "petrol" });
  if (m.discordam) selos.push({ titulo: "Modelos discordam", tom: "alerta" });
  if (m.apartamentos) selos.push({ titulo: "Muitos prédios (menos telhados)", tom: "neutro" });
  return selos;
}

// Cabeçalho da lista de municípios: "Cidade" à esquerda e a coluna do critério à direita
export function CabecalhoLista({ coluna }) {
  const c = useCores();
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}
      importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Txt variante="rotulo" style={{ width: 28 }}>#</Txt>
      <Txt variante="rotulo" style={{ flex: 1 }}>Cidade</Txt>
      <Txt variante="rotulo" style={{ textAlign: "right" }}>{coluna}</Txt>
    </View>
  );
}

// Separador discreto antes das cidades com ressalvas
export function Separador({ titulo }) {
  return <Txt variante="legenda" style={{ paddingTop: 14, paddingBottom: 2 }} accessibilityRole="header">{titulo}</Txt>;
}

// Coluna da direita e barra de cada critério de ordenação: uma métrica só, coerente com a ordem
const COLUNAS = { espaco: "Clientes", oportunidade: "Nota", adocao: "Instaladas" };
export function colunaDe(criterio) { return COLUNAS[criterio] || COLUNAS.espaco; }

// Item de ranking de municípios. criterio: "espaco" (clientes em potencial), "oportunidade" (nota) ou "adocao".
// max: maior "espaco" da lista, para a barra de clientes ficar proporcional ao primeiro.
export function ItemMunicipio({ m, criterio = "espaco", max, onPress }) {
  const c = useCores();
  const distancia = m.distancia_km != null ? m.distancia_km + " km" : "";
  let valor, sub = null, barra = null, meta = "";
  if (criterio === "oportunidade") {
    valor = m.ipne != null ? String(m.ipne) : "–";
    sub = m.nivel;
    barra = m.ipne;
    meta = m.manchete || "";
  } else if (criterio === "adocao") {
    valor = texto(compacto(m.instalacoes));
    meta = m.potencia_kw != null ? texto(potencia(m.potencia_kw)) + " instalados" : "";
  } else {
    valor = m.espaco > 0 ? texto(compacto(m.espaco)) : "–";
    sub = "clientes";
    barra = m.espaco > 0 && max > 0 ? (m.espaco / max) * 100 : 0;
    meta = m.ipne != null ? "Nota " + m.ipne + (m.nivel ? " · " + m.nivel : "") : "";
  }
  const selos = criterio === "adocao" ? [] : textoSelos(m);
  const rotulo = m.posicao + ". " + m.nome + ", " + m.uf + (distancia ? ", a " + distancia : "") + ". " +
    colunaDe(criterio) + ": " + valor + (sub ? " " + sub : "") + (meta ? ". " + meta : "") +
    (selos.length ? ". " + selos.map((s) => s.titulo).join(", ") : "");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityHint="Abre a ficha em Explorar"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1,
      })}
    >
      <Txt style={{ width: 28, fontFamily: FONTE.media, color: c.faint, fontSize: T.sm }}>{m.posicao}</Txt>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Txt style={{ fontFamily: FONTE.media, flexShrink: 1 }} numberOfLines={1}>{m.nome + ", " + m.uf}</Txt>
          {distancia ? <Txt variante="legenda">{distancia}</Txt> : null}
        </View>
        {meta ? <Txt variante="legenda" numberOfLines={2}>{meta}</Txt> : null}
        {barra != null ? (
          <View style={{ height: 4, backgroundColor: c.track, borderRadius: 2, marginTop: 6 }}>
            <View style={{ height: 4, width: Math.max(0, Math.min(100, barra)) + "%", backgroundColor: c.amber, borderRadius: 2 }} />
          </View>
        ) : null}
        {selos.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {selos.map((s) => <Selo key={s.titulo} titulo={s.titulo} tom={s.tom} />)}
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 104 }}>
        <Txt style={{ fontFamily: FONTE.forte, fontSize: T.lg, textAlign: "right" }}>{valor}</Txt>
        {sub ? <Txt variante="legenda" style={{ textAlign: "right" }} numberOfLines={2}>{sub}</Txt> : null}
      </View>
    </Pressable>
  );
}

// Lista de municípios com o separador "Com ressalvas" antes do primeiro duvidoso (quando a API os mandou para o fim)
export function ListaRanking({ itens, criterio, ressalvas, aoAbrir }) {
  let max = 0;
  if (criterio === "espaco") for (const m of itens) if (m.espaco > max) max = m.espaco;
  const primeiroDuvidoso = ressalvas ? itens.findIndex((m) => m.duvidoso) : -1;
  return (
    <View>
      <CabecalhoLista coluna={colunaDe(criterio)} />
      {itens.map((m, i) => (
        <View key={m.codigo}>
          {i === primeiroDuvidoso ? <Separador titulo={ressalvas} /> : null}
          <ItemMunicipio m={m} criterio={criterio} max={max} onPress={() => aoAbrir(m)} />
        </View>
      ))}
    </View>
  );
}

// Frase única sobre os dois modelos (vem pronta da API). Em desacordo, estilo de alerta.
export function Veredito({ texto, alerta, style }) {
  const c = useCores();
  if (!texto) return null;
  return (
    <View style={[{
      backgroundColor: alerta ? c.dangerBg : c.track, borderLeftWidth: 3, borderLeftColor: alerta ? c.danger : c.petrol,
      borderRadius: RAIO, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12,
    }, style]} accessibilityRole={alerta ? "alert" : undefined}>
      <Txt style={{ fontFamily: FONTE.media, fontSize: T.sm, lineHeight: 20, color: alerta ? c.danger : c.ink }}>{texto}</Txt>
    </View>
  );
}

// "Por que vender aqui": argumentos prontos da API, um por linha. Sem argumentos, não aparece.
export function PorQueVender({ argumentos, style }) {
  const c = useCores();
  if (!argumentos || !argumentos.length) return null;
  return (
    <View style={style}>
      <Txt variante="forte" accessibilityRole="header">Por que vender aqui</Txt>
      <View style={{ marginTop: 6, gap: 6 }}>
        {argumentos.map((a, i) => (
          <View key={a.tipo + i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.amber, marginTop: 9 }} />
            <Txt variante="fraco" style={{ flex: 1, color: c.ink }}>{a.texto}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

// "Ver mais" e "Ver menos" lado a lado; cada um só aparece quando faz sentido
export function MaisMenos({ mais, menos, aoMais, aoMenos }) {
  if (!mais && !menos) return null;
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
      {menos ? <BotaoTexto titulo="Ver menos" onPress={aoMenos} style={{ flex: 1, alignItems: "center" }} /> : null}
      {mais ? <BotaoTexto titulo="Ver mais" onPress={aoMais} style={{ flex: 1, alignItems: "center" }} /> : null}
    </View>
  );
}

// Setinha para baixo (seletores)
export function Seta({ cor, tamanho = 16 }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m6 9 6 6 6-6" />
    </Svg>
  );
}
