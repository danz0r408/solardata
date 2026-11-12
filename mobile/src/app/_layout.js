// Raiz do app: fontes, estado salvo no aparelho e a pilha de telas
import { useFonts, HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProvedorApp, useApp, useCores } from "../lib/estado";

function Pilha() {
  const app = useApp();
  const c = useCores();
  // até ler a sessão salva, só o fundo (evita piscar o login para quem já entrou)
  if (!app.carregado) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <>
      <StatusBar style={c.escuro ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="cadastro" />
        <Stack.Screen name="(abas)" />
        <Stack.Screen name="escolher-local" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function Raiz() {
  const [fontes] = useFonts({ HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold });
  return (
    <SafeAreaProvider>
      <ProvedorApp>
        {fontes ? <Pilha /> : null}
      </ProvedorApp>
    </SafeAreaProvider>
  );
}
