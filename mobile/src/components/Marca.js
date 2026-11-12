// Marca do SolarData (o mesmo desenho do site: sol nascendo atrás de barras de dados)
import { View } from "react-native";
import Svg, { Circle, G, Line, Rect } from "react-native-svg";
import { useCores } from "../lib/estado";

export default function Marca({ tamanho = 48 }) {
  const c = useCores();
  return (
    <View aria-hidden>
      <Svg width={tamanho} height={tamanho} viewBox="0 0 64 64">
        <G stroke={c.amber} strokeWidth={3} strokeLinecap="round">
          <Line x1={32} y1={6} x2={32} y2={11} />
          <Line x1={16} y1={14} x2={19.5} y2={17.5} />
          <Line x1={48} y1={14} x2={44.5} y2={17.5} />
          <Line x1={10} y1={27} x2={15} y2={27} />
          <Line x1={54} y1={27} x2={49} y2={27} />
        </G>
        <Circle cx={32} cy={29} r={10} fill={c.amber} />
        <G fill={c.ink}>
          <Rect x={14} y={36} width={7} height={14} rx={1.5} />
          <Rect x={24} y={31} width={7} height={19} rx={1.5} />
          <Rect x={34} y={27} width={7} height={23} rx={1.5} />
          <Rect x={44} y={32} width={7} height={18} rx={1.5} />
        </G>
      </Svg>
    </View>
  );
}
