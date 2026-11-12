// Mapa do Explorar: estados do Brasil e, dentro de um estado, os municípios. Mesma lógica de cor e
// enquadramento do site: escala sobre o Brasil todo, moldura de proporção fixa (a tela abaixo não pula).
import { memo, useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { useCores } from "../lib/estado";
import { MAPA } from "../lib/mapa-ufs";
import { rampa } from "../lib/tema";

const W = MAPA.largura, H = MAPA.altura;

// Recorte de um conjunto de estados, ampliado para a proporção da moldura, com 6% de margem
export function recorte(siglas) {
  if (!siglas || !siglas.length) return [0, 0, W, H];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  siglas.forEach((s) => {
    const b = MAPA.caixas[s];
    if (!b) return;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
  });
  if (x0 === Infinity) return [0, 0, W, H];
  let w = (x1 - x0) * 1.12, h = (y1 - y0) * 1.12;
  if (w / h > W / H) h = (w * H) / W; else w = (h * W) / H;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return [cx - w / 2, cy - h / 2, w, h];
}

// Um contorno; memo para que trocar o destaque de um não redesenhe os outros 852 (MG)
const Forma = memo(function Forma({ id, d, fill, stroke, strokeWidth, opacity, aoTocar }) {
  return (
    <Path
      d={d}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      opacity={opacity}
      onPress={aoTocar ? () => aoTocar(id) : undefined}
    />
  );
});

export default function MapaBrasil({
  estados, metrica, regiao, dentro, municipios, marcadoUF, marcadoMun, aoTocarUF, aoTocarMun,
}) {
  const c = useCores();
  const [largura, setLargura] = useState(340);
  const cor = metrica === "oportunidade" ? c.amber : c.petrol;
  const tom = useMemo(() => rampa(c.track, cor), [c.track, cor]);

  const vb = useMemo(() => {
    if (dentro) return recorte([dentro]);
    if (regiao) return recorte(Object.keys(estados).filter((s) => estados[s].regiao === regiao));
    return recorte(null);
  }, [dentro, regiao, estados]);
  // traço constante em pixels de tela, qualquer que seja o zoom
  const px = vb[2] / largura;

  // escala dos estados sobre o Brasil todo: trocar de região não muda a cor de um estado
  const corUF = useMemo(() => {
    const campo = metrica === "oportunidade" ? "ipne_ponderado" : "inst_por_mil_hab";
    const vals = Object.values(estados).map((u) => u[campo]).filter((v) => v != null);
    const min = Math.min(...vals), faixa = Math.max(...vals) - min || 1;
    const r = {};
    Object.keys(MAPA.ufs).forEach((s) => {
      const v = estados[s] ? estados[s][campo] : null;
      r[s] = v == null ? c.track : tom((v - min) / faixa);
    });
    return r;
  }, [estados, metrica, tom, c.track]);

  const corMun = useMemo(() => {
    if (!municipios) return null;
    const campo = metrica === "oportunidade" ? "ipne" : "inst_por_mil_hab";
    let escala;
    if (metrica === "oportunidade") escala = (v) => v / 100; // o IPNE já é uma nota de 0 a 100
    else {
      // adoção é muito assimétrica: escala log para separar os municípios de adoção baixa
      const vals = Object.values(municipios.dados).map((x) => x[campo]).filter((v) => v != null);
      const lmin = Math.log1p(Math.min(...vals)), faixa = Math.log1p(Math.max(...vals)) - lmin || 1;
      escala = (v) => (Math.log1p(v) - lmin) / faixa;
    }
    const r = {};
    Object.keys(municipios.paths).forEach((cod) => {
      const d = municipios.dados[cod];
      const v = d ? d[campo] : null;
      r[cod] = v == null ? c.track : tom(escala(v));
    });
    return r;
  }, [municipios, metrica, tom, c.track]);

  const siglas = Object.keys(MAPA.ufs);
  const naRegiao = (s) => !regiao || (estados[s] && estados[s].regiao === regiao);
  const marcadoUfAtivo = !dentro && marcadoUF && MAPA.ufs[marcadoUF] ? marcadoUF : null;
  const munMarcado = dentro && municipios && marcadoMun && municipios.paths[marcadoMun] ? String(marcadoMun) : null;

  return (
    <View
      onLayout={(e) => setLargura(e.nativeEvent.layout.width || 340)}
      style={{ width: "100%", maxWidth: 440, alignSelf: "center", aspectRatio: W / H, overflow: "hidden" }}
    >
      <Svg width="100%" height="100%" viewBox={vb.map((n) => n.toFixed(2)).join(" ")}>
        <G>
          {siglas.map((s) => {
            const aberto = dentro === s;
            const fora = dentro ? !aberto : !naRegiao(s);
            if (aberto) return null; // o estado aberto vem por cima dos municípios
            return (
              <Forma
                key={s}
                id={s}
                d={MAPA.ufs[s]}
                fill={dentro ? c.track : corUF[s]}
                stroke={c.bg}
                strokeWidth={px}
                opacity={fora ? 0.18 : 1}
                aoTocar={fora || !estados[s] ? null : aoTocarUF}
              />
            );
          })}
        </G>
        {dentro && municipios ? (
          <G>
            {Object.keys(municipios.paths).map((cod) => (
              <Forma
                key={cod}
                id={cod}
                d={municipios.paths[cod]}
                fill={corMun[cod]}
                stroke={c.bg}
                strokeWidth={px * 0.5}
                opacity={1}
                aoTocar={aoTocarMun}
              />
            ))}
          </G>
        ) : null}
        {dentro ? (
          <Path d={MAPA.ufs[dentro]} fill="none" stroke={c.ink} strokeWidth={px * 1.5} strokeLinejoin="round" />
        ) : null}
        {marcadoUfAtivo ? (
          <Path d={MAPA.ufs[marcadoUfAtivo]} fill="none" stroke={c.ink} strokeWidth={px * 2} strokeLinejoin="round" />
        ) : null}
        {munMarcado ? (
          <Path d={municipios.paths[munMarcado]} fill="none" stroke={c.ink} strokeWidth={px * 2} strokeLinejoin="round" />
        ) : null}
      </Svg>
    </View>
  );
}
