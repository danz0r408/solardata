// Peças de interface compartilhadas pelas telas (equivalentes às classes do styles.css do site)
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useCores } from "../lib/estado";
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
  return <Text style={[base, style]} {...props}>{children}</Text>;
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
              flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: RAIO - 2,
              backgroundColor: ativo ? c.surface : "transparent",
            }}
          >
            <Txt style={{ fontFamily: ativo ? FONTE.forte : FONTE.media, fontSize: T.sm, color: ativo ? c.ink : c.muted }}>{o.titulo}</Txt>
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
      accessibilityLabel={posicao + ". " + nome + (meta ? ", " + meta : "") + ", " + valor}
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
      <Txt style={{ fontFamily: FONTE.forte, textAlign: "right" }}>{valor}</Txt>
    </Pressable>
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
