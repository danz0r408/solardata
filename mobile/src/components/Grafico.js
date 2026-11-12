// Gráfico de barras da evolução (mesma geometria do site: 320 x 180, últimos 7 anos completos)
import { View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { useCores } from "../lib/estado";
import { compacto, potencia, texto } from "../lib/fmt";
import { FONTE } from "../lib/tema";
import { Txt } from "./ui";

const W = 320, BASE = 150, TOPO = 26, LARGURA = 20, ANOS = 7;

function passoBonito(max) {
  const bruto = max / 2, mag = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const n = bruto / mag;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag;
}

export default function Grafico({ serie, metrica }) {
  const c = useCores();
  const rotulo = (v) => (metrica === "acumulado" ? texto(compacto(v)) : texto(potencia(v)));
  const completos = serie.filter((p) => !p.parcial).slice(-ANOS);
  if (!completos.length) return <Txt variante="fraco" style={{ paddingVertical: 24 }}>Sem instalações registradas.</Txt>;

  const max = Math.max(...completos.map((p) => p[metrica])) || 1;
  const escala = (BASE - TOPO) / max;
  const passo = passoBonito(max);
  const slot = W / completos.length;
  const grade = [];
  for (let t = passo; t <= max * 0.85; t += passo) grade.push(t);
  const fonte = { fontFamily: FONTE.regular, fontSize: 11 };
  const nome = metrica === "acumulado" ? "Instalações acumuladas" : "Potência acumulada";
  const descricao = nome + ": " + completos.map((p) => p.ano + " " + rotulo(p[metrica])).join(", ");

  return (
    <View>
      <View accessible accessibilityLabel={descricao} style={{ width: "100%", aspectRatio: 320 / 180 }}>
        <Svg width="100%" height="100%" viewBox="0 0 320 180">
          <Line x1={0} x2={320} y1={150} y2={150} stroke={c.line} strokeWidth={1} />
          {grade.map((t) => {
            const y = BASE - t * escala;
            return [
              <Line key={"l" + t} x1={0} x2={320} y1={y} y2={y} stroke={c.line} strokeWidth={1} strokeDasharray="2 3" />,
              <SvgText key={"t" + t} x={0} y={y - 6} fill={c.faint} {...fonte}>{rotulo(t)}</SvgText>,
            ];
          })}
          {completos.map((p, i) => {
            const v = p[metrica], h = Math.max(v * escala, v > 0 ? 2 : 0);
            const x = slot * i + (slot - LARGURA) / 2, topo = BASE - h, r = Math.min(2, h / 2);
            const ultimo = i === completos.length - 1;
            const d = `M${x} 150V${topo + r}Q${x} ${topo} ${x + r} ${topo}H${x + LARGURA - r}Q${x + LARGURA} ${topo} ${x + LARGURA} ${topo + r}V150Z`;
            const cx = x + LARGURA / 2;
            return [
              <Path key={"b" + p.ano} d={d} fill={ultimo ? c.petrol : c.bar} />,
              <SvgText key={"a" + p.ano} x={cx} y={170} textAnchor="middle" fill={ultimo ? c.ink : c.muted}
                {...fonte} fontFamily={ultimo ? FONTE.forte : FONTE.regular}>{p.ano}</SvgText>,
              ultimo ? (
                <SvgText key="v" x={cx} y={Math.max(topo - 8, 10)} textAnchor="middle" fill={c.ink}
                  fontFamily={FONTE.forte} fontSize={12}>{rotulo(v)}</SvgText>
              ) : null,
            ];
          })}
        </Svg>
      </View>
      <Txt variante="legenda" style={{ marginTop: 8 }}>
        {nome + ", " + completos[0].ano + " a " + completos[completos.length - 1].ano + " · por data de atualização cadastral na ANEEL"}
      </Txt>
    </View>
  );
}
