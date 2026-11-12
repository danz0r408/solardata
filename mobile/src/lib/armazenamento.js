// Guarda pequenos valores JSON no aparelho. No celular usa o SecureStore (o token fica no
// cofre do sistema); no navegador (expo start --web, só para testes) cai no localStorage.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const WEB = Platform.OS === "web";

export async function le(chave) {
  try {
    const bruto = WEB ? globalThis.localStorage.getItem(chave) : await SecureStore.getItemAsync(chave);
    return bruto == null ? null : JSON.parse(bruto);
  } catch {
    return null;
  }
}

export async function grava(chave, valor) {
  try {
    if (valor == null) {
      if (WEB) globalThis.localStorage.removeItem(chave);
      else await SecureStore.deleteItemAsync(chave);
    } else {
      const bruto = JSON.stringify(valor);
      if (WEB) globalThis.localStorage.setItem(chave, bruto);
      else await SecureStore.setItemAsync(chave, bruto);
    }
  } catch {
    // sem armazenamento: o app segue com o valor em memória até fechar
  }
}
