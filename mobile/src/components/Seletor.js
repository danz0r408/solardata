// Lista suspensa (o <select> do site): mostra a opção atual e abre as opções numa folha por cima da tela
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCores } from "../lib/estado";
import { FONTE, RAIO, T } from "../lib/tema";
import { Seta, Txt } from "./ui";

export default function Seletor({ rotulo, opcoes, valor, aoMudar, style }) {
  const c = useCores();
  const insets = useSafeAreaInsets();
  const [aberto, setAberto] = useState(false);
  const atual = opcoes.find((o) => o.valor === valor) || opcoes[0];

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={rotulo + ": " + (atual ? atual.titulo : "")}
        style={({ pressed }) => [{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, minHeight: 44,
          paddingHorizontal: 12, borderWidth: 1, borderColor: c.line, borderRadius: RAIO,
          backgroundColor: pressed ? c.track : c.surface,
        }, style]}
      >
        <Txt style={{ fontSize: T.sm, fontFamily: FONTE.media, flexShrink: 1 }} numberOfLines={1}>{atual ? atual.titulo : ""}</Txt>
        <Seta cor={c.muted} />
      </Pressable>

      <Modal visible={aberto} transparent animationType="slide" onRequestClose={() => setAberto(false)}>
        <Pressable style={{ flex: 1, backgroundColor: c.escuro ? "#000A" : "#131F2259" }} onPress={() => setAberto(false)}
          accessibilityLabel="Fechar" />
        <View style={{
          maxHeight: "70%", backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
          paddingBottom: insets.bottom + 8,
        }}>
          <Txt variante="rotulo" style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>{rotulo}</Txt>
          <FlatList
            data={opcoes}
            keyExtractor={(o) => String(o.valor)}
            renderItem={({ item: o }) => {
              const ativo = o.valor === valor;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  onPress={() => { setAberto(false); if (!ativo) aoMudar(o.valor); }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 20, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between",
                    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
                    backgroundColor: pressed ? c.track : "transparent",
                  })}
                >
                  <Txt style={{ fontFamily: ativo ? FONTE.forte : FONTE.regular, color: ativo ? c.petrol : c.ink }}>{o.titulo}</Txt>
                  {ativo ? <Txt style={{ color: c.petrol }}>✓</Txt> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}
