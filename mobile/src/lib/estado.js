// Estado do app: sessão, "minha cidade" (Início), local aberto no Explorar, recentes e tema.
// Tudo fica salvo no aparelho e é lido uma vez, quando o app abre.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import { defineToken, quandoSessaoExpirar } from "./api";
import { le, grava } from "./armazenamento";
import { mesmo } from "./fmt";
import { CORES } from "./tema";

export const LOCAL_PADRAO = { tipo: "municipio", codigo: 3509502, nome: "Campinas", uf: "SP" };

// Raio de "Oportunidades perto de você" (km)
export const RAIOS = [50, 100, 200];
const RAIO_PADRAO = 100;

const CHAVES = {
  token: "sd.token", usuario: "sd.usuario", local: "sd.local",
  explorar: "sd.explorar", recentes: "sd.recentes", tema: "sd.tema", raio: "sd.raio",
};

const Contexto = createContext(null);

function item(l) { return { tipo: l.tipo, codigo: l.codigo, nome: l.nome, uf: l.uf }; }

export function ProvedorApp({ children }) {
  const [s, setS] = useState({
    carregado: false, token: null, usuario: null, local: null, explorar: null,
    recentes: [LOCAL_PADRAO], tema: "sistema", raio: RAIO_PADRAO, pedidoExplorar: 0,
  });
  const atual = useRef(s);
  atual.current = s;

  useEffect(() => {
    let vivo = true;
    (async () => {
      const valores = await Promise.all(Object.values(CHAVES).map(le));
      if (!vivo) return;
      const [token, usuario, local, explorar, recentes, tema, raio] = valores;
      defineToken(token);
      setS({
        carregado: true, token, usuario, local, explorar,
        recentes: Array.isArray(recentes) && recentes.length ? recentes : [LOCAL_PADRAO],
        tema: tema || "sistema", raio: RAIOS.includes(raio) ? raio : RAIO_PADRAO, pedidoExplorar: 0,
      });
    })();
    return () => { vivo = false; };
  }, []);

  const muda = useCallback((parcial) => {
    setS((v) => ({ ...v, ...parcial }));
    Object.entries(parcial).forEach(([k, v]) => { if (CHAVES[k]) grava(CHAVES[k], v); });
  }, []);

  const sai = useCallback(() => {
    defineToken(null);
    muda({ token: null, usuario: null });
  }, [muda]);

  useEffect(() => { quandoSessaoExpirar(sai); }, [sai]);

  const acoes = useMemo(() => {
    const comRecente = (l) => {
      const recentes = [l, ...atual.current.recentes.filter((r) => !mesmo(r, l))].slice(0, 4);
      return recentes;
    };
    return {
      entra: (dados) => { defineToken(dados.token); muda({ token: dados.token, usuario: dados.usuario }); },
      sai,
      atualizaUsuario: (u) => muda({ usuario: u }),
      // "minha cidade" do Início: só muda quando o usuário troca o local no topo do Início
      escolheLocal: (l) => { const i = item(l); muda({ local: i, recentes: comRecente(i) }); },
      // local aberto no Explorar: independente da "minha cidade"
      // pedidoExplorar conta as escolhas desta sessão: o Explorar rola até a ficha (ou o mapa) a cada nova escolha
      escolheExplorar: (l) => {
        const i = item(l);
        muda({ explorar: i, recentes: comRecente(i), pedidoExplorar: atual.current.pedidoExplorar + 1 });
      },
      defineTema: (t) => muda({ tema: t }),
      defineRaio: (km) => muda({ raio: km }),
    };
  }, [muda, sai]);

  const valor = useMemo(() => ({ ...s, ...acoes }), [s, acoes]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApp() { return useContext(Contexto); }

// Local do Início e do Explorar com o padrão (Campinas) quando o usuário ainda não escolheu
export function useLocais() {
  const app = useApp();
  const local = app.local || LOCAL_PADRAO;
  return { local, explorar: app.explorar || local, escolhido: app.local !== null };
}

// Paleta do tema atual: segue o sistema, a menos que o usuário fixe claro/escuro no Perfil
export function useCores() {
  const { tema } = useApp();
  const sistema = useColorScheme();
  const escuro = tema === "escuro" || (tema === "sistema" && sistema === "dark");
  return escuro ? CORES.escuro : CORES.claro;
}
