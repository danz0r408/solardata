// Barra de abas (as mesmas quatro do site). Sem sessão, volta para o login.
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { useApp, useCores } from "../../lib/estado";
import { FONTE } from "../../lib/tema";

function Icone({ nome, cor }) {
  const props = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: cor, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  if (nome === "inicio") {
    return <Svg {...props}><Path d="M4 10.5 12 4l8 6.5V20h-5v-6h-6v6H4z" /></Svg>;
  }
  if (nome === "explorar") {
    return <Svg {...props}><Circle cx={12} cy={12} r={8.5} /><Path d="m15.5 8.5-2 5-5 2 2-5z" /></Svg>;
  }
  if (nome === "rankings") {
    return <Svg {...props}><Path d="M5 20V11M12 20V5M19 20v-6" /></Svg>;
  }
  return <Svg {...props}><Circle cx={12} cy={8.5} r={3.5} /><Path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" /></Svg>;
}

export default function Abas() {
  const { token } = useApp();
  const c = useCores();
  const insets = useSafeAreaInsets();
  if (!token) return <Redirect href="/login" />;

  const aba = (nome, titulo) => (
    <Tabs.Screen
      name={nome}
      options={{ title: titulo, tabBarIcon: ({ color }) => <Icone nome={nome} cor={color} /> }}
    />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.petrol,
        tabBarInactiveTintColor: c.muted,
        // altura fixa + área segura: o rótulo com a Hanken Grotesk não é cortado
        tabBarStyle: {
          backgroundColor: c.surface, borderTopColor: c.line,
          height: 70 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6,
        },
        tabBarLabelStyle: { fontFamily: FONTE.media, fontSize: 12, lineHeight: 18 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {aba("inicio", "Início")}
      {aba("explorar", "Explorar")}
      {aba("rankings", "Rankings")}
      {aba("perfil", "Perfil")}
    </Tabs>
  );
}
