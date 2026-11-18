// Splash: espera a API ficar pronta (a base de dados pode estar acordando) e segue para o Início ou o login
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../lib/api";
import { useApp, useCores } from "../lib/estado";
import Marca from "../components/Marca";
import { Botao, Txt } from "../components/ui";
import { FONTE } from "../lib/tema";

const LIMITE_MS = 90000;
const MINIMO_MS = 1000; // o suficiente para a marca aparecer

export default function Splash() {
  const router = useRouter();
  const { token } = useApp();
  const c = useCores();
  const [msg, setMsg] = useState("Preparando os dados…");
  const [desistiu, setDesistiu] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true, timer = null;
    const inicio = Date.now();
    const segue = () => {
      timer = setTimeout(() => {
        if (vivo) router.replace(token ? "/inicio" : "/login");
      }, Math.max(0, MINIMO_MS - (Date.now() - inicio)));
    };
    const agenda = () => {
      if (Date.now() - inicio > LIMITE_MS) {
        setMsg("Os dados estão demorando. Toque para tentar de novo.");
        setDesistiu(true);
        return;
      }
      timer = setTimeout(verifica, 1500);
    };
    const verifica = () => {
      api("/status", { publica: true })
        .then((s) => {
          if (!vivo) return;
          if (s.pronto) return segue();
          if (Date.now() - inicio > 6000) setMsg("Conectando à base de dados…");
          agenda();
        })
        .catch(() => {
          if (!vivo) return;
          setMsg("Aguardando o servidor do SolarData…");
          agenda();
        });
    };
    verifica();
    return () => { vivo = false; clearTimeout(timer); };
  }, [tentativa]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
      <Marca tamanho={64} />
      <Txt style={{ fontFamily: FONTE.forte, fontSize: 32, letterSpacing: -0.6 }}>SolarData</Txt>
      <Txt variante="fraco">Dados que iluminam novas oportunidades.</Txt>
      <Txt variante="legenda" style={{ textAlign: "center", marginTop: 24 }} accessibilityLiveRegion="polite">{msg}</Txt>
      {desistiu ? (
        <Botao titulo="Tentar de novo" onPress={() => { setDesistiu(false); setMsg("Preparando os dados…"); setTentativa((t) => t + 1); }} />
      ) : null}
    </View>
  );
}
