// Início: IPNE, indicadores e evolução da "minha cidade"
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api, ignoravel, linhaFonte } from "../../lib/api";
import { useApp, useCores, useLocais } from "../../lib/estado";
import { caminho, compacto, dataCurta, iniciais, numero, potencia, texto, variacao } from "../../lib/fmt";
import { COMO_LER_IPNE, semelhantes as textoSemelhantes, semIPNE } from "../../lib/textos";
import { FONTE, RAIO, T } from "../../lib/tema";
import Grafico from "../../components/Grafico";
import { Aviso, Carregando, Cartao, Secao, Segmentado, Seta, Tela, Txt } from "../../components/ui";

function Metrica({ rotulo, par, delta, destaque }) {
  const c = useCores();
  return (
    <View style={{ flex: 1, minWidth: "45%", paddingVertical: 12 }}>
      <Txt variante="fraco">{rotulo}</Txt>
      {/* valor e unidade lado a lado (e não aninhados): no iOS o texto pequeno aninhado encolhe a linha do grande */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 2 }}>
        {par.prefixo ? <Txt style={{ fontSize: T.sm, color: c.muted }}>{par.prefixo}</Txt> : null}
        <Txt style={{ fontFamily: FONTE.forte, fontSize: destaque ? T.xl : T.lg, letterSpacing: -0.3 }}>{par.valor}</Txt>
        {par.unidade ? <Txt style={{ fontSize: T.sm, color: c.muted }}>{par.unidade}</Txt> : null}
      </View>
      {delta ? <Txt variante="legenda" style={{ color: c.petrol, fontFamily: FONTE.media }}>{delta}</Txt> : null}
    </View>
  );
}

function Barra({ rotulo, valor, max, cor }) {
  const c = useCores();
  const largura = Math.max((valor / (max || 1)) * 100, valor > 0 ? 1.5 : 0);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
      <Txt variante="fraco" style={{ width: 128 }}>{rotulo}</Txt>
      <View style={{ flex: 1, height: 10, backgroundColor: c.track, borderRadius: 5 }}>
        <View style={{ width: largura + "%", height: 10, backgroundColor: cor, borderRadius: 5 }} />
      </View>
      <Txt style={{ fontFamily: FONTE.forte, minWidth: 56, textAlign: "right" }}>{texto(compacto(valor))}</Txt>
    </View>
  );
}

function ComoLer() {
  const router = useRouter();
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      {COMO_LER_IPNE.map((paragrafo, i) => (
        <Txt key={i} variante="fraco">
          {paragrafo.map(([t, negrito], j) => (
            <Txt key={j} variante="fraco" style={negrito ? { fontFamily: FONTE.forte } : null}>{t}</Txt>
          ))}
        </Txt>
      ))}
      <Pressable onPress={() => router.navigate({ pathname: "/perfil", params: { secao: "como-ler" } })} accessibilityRole="link">
        <Txt variante="link">Metodologia completa</Txt>
      </Pressable>
    </View>
  );
}

function Semelhantes({ r, aoAbrir }) {
  const c = useCores();
  const [estado, setEstado] = useState({ itens: null, erro: null });
  useEffect(() => {
    const controle = new AbortController();
    api("/municipios/" + encodeURIComponent(r.codigo) + "/semelhantes", { signal: controle.signal })
      .then((itens) => setEstado({ itens, erro: null }))
      .catch((e) => { if (!ignoravel(e)) setEstado({ itens: null, erro: e.message }); });
    return () => controle.abort();
  }, [r.codigo]);

  return (
    <View style={{ marginTop: 12 }}>
      <Txt variante="legenda">{textoSemelhantes(r.nome)}</Txt>
      {estado.erro ? <Txt variante="fraco" style={{ marginTop: 8 }}>{estado.erro}</Txt> : null}
      {!estado.itens && !estado.erro ? <Carregando texto="Buscando…" /> : null}
      {estado.itens && !estado.itens.length ? (
        <Txt variante="fraco" style={{ marginTop: 8 }}>Sem dados suficientes para comparar este município.</Txt>
      ) : null}
      {(estado.itens || []).map((m) => {
        const detalhes = [texto(compacto(m.populacao)) + " hab."];
        if (m.renda_pc != null) detalhes.push("renda R$ " + numero(m.renda_pc) + "/mês");
        if (m.inst_por_mil_hab != null) detalhes.push(numero(m.inst_por_mil_hab, 1) + " inst./mil hab.");
        return (
          <Pressable
            key={m.codigo}
            accessibilityRole="button"
            accessibilityHint="Abre a ficha em Explorar"
            onPress={() => aoAbrir({ tipo: "municipio", codigo: m.codigo, nome: m.nome, uf: m.uf })}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11,
              borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line, opacity: pressed ? 0.6 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: FONTE.media }}>{m.nome + ", " + m.uf}</Txt>
              <Txt variante="legenda">{detalhes.join(" · ")}</Txt>
            </View>
            {m.ipne != null
              ? <Txt style={{ fontFamily: FONTE.forte, color: c.petrol }}>IPNE {m.ipne}</Txt>
              : <Txt variante="legenda">Sem IPNE</Txt>}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Inicio() {
  const router = useRouter();
  const app = useApp();
  const { local, escolhido } = useLocais();
  const c = useCores();
  const [dados, setDados] = useState(null); // {r, serie}
  const [erro, setErro] = useState(null);
  const [fonte, setFonte] = useState("");
  const [metrica, setMetrica] = useState("acumulado");
  const [ajuda, setAjuda] = useState(false);
  const [verSemelhantes, setVerSemelhantes] = useState(false);
  const scroll = useRef(null);

  useEffect(() => {
    const controle = new AbortController();
    const opcoes = { signal: controle.signal };
    setErro(null);
    setVerSemelhantes(false);
    const rota = caminho(local);
    Promise.all([api(rota, opcoes), api(rota + "/historico", opcoes)])
      .then(([r, serie]) => {
        setDados({ r, serie });
        linhaFonte(r.referencias, dataCurta).then(setFonte);
      })
      .catch((e) => {
        if (ignoravel(e)) return;
        setErro(e.status === 404 ? "Local não encontrado. Toque no nome no topo para escolher outro." : e.message);
      });
    return () => controle.abort();
  }, [local.tipo, local.codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  const abreNoExplorar = (l) => { app.escolheExplorar(l); router.navigate("/explorar"); };
  // os dados na tela são do local atual? (troca de local: mostra carregando em vez dos números antigos)
  const r = dados && String(dados.r.codigo) === String(local.codigo) && dados.r.tipo === local.tipo ? dados.r : null;
  const ipne = r && r.ipne;

  const cabecalho = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
      <Pressable
        onPress={() => router.push("/escolher-local")}
        accessibilityRole="button"
        accessibilityLabel={"Trocar local. Atual: " + (local.tipo === "uf" ? local.nome : local.nome + ", " + local.uf)}
        style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}
      >
        <Txt variante="rotulo">Minha cidade</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Txt style={{ fontFamily: FONTE.forte, fontSize: T.lg, flexShrink: 1 }} numberOfLines={1}>
            {local.nome}
            {local.tipo !== "uf" ? <Txt style={{ fontFamily: FONTE.regular, color: c.muted, fontSize: T.lg }}>{" " + local.uf}</Txt> : null}
          </Txt>
          <Seta cor={c.petrol} tamanho={18} />
        </View>
      </Pressable>
      <Pressable onPress={() => router.navigate("/perfil")} accessibilityRole="button" accessibilityLabel="Perfil"
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.track, alignItems: "center", justifyContent: "center" }}>
        <Txt style={{ fontFamily: FONTE.forte, fontSize: T.sm }}>{iniciais(app.usuario && app.usuario.nome)}</Txt>
      </Pressable>
    </View>
  );

  const anoAnt = r ? r.referencias.ano_completo - 1 : 0;
  const deltaInst = r && r.crescimento_instalacoes_pct != null ? variacao(r.crescimento_instalacoes_pct) + " vs. " + anoAnt : "";
  const deltaPot = r && r.crescimento_potencia_pct != null ? variacao(r.crescimento_potencia_pct) + " vs. " + anoAnt : "";

  return (
    <Tela cabecalho={cabecalho} refScroll={scroll}>
      {!escolhido ? (
        <Pressable onPress={() => router.push("/escolher-local")} accessibilityRole="button">
          <Aviso style={{ marginTop: 0 }}>
            {"Mostrando Campinas como exemplo. "}
            <Txt variante="link">Escolha seu município</Txt>
            {" para ver os dados dele."}
          </Aviso>
        </Pressable>
      ) : null}

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {!r && !erro ? <Carregando texto="Conectando aos dados…" /> : null}

      {r ? (
        <>
          <Cartao style={{ marginTop: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt variante="rotulo">Oportunidade (IPNE)</Txt>
              <Pressable
                onPress={() => setAjuda((a) => !a)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Como ler o IPNE"
                accessibilityState={{ expanded: ajuda }}
                style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: ajuda ? c.petrol : c.line, alignItems: "center", justifyContent: "center" }}
              >
                <Txt style={{ fontFamily: FONTE.forte, fontSize: 13, color: ajuda ? c.petrol : c.muted }}>i</Txt>
              </Pressable>
            </View>
            {ajuda ? <ComoLer /> : null}

            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 8 }}>
              <Txt style={{ fontFamily: FONTE.forte, fontSize: T.xxl, letterSpacing: -1, color: c.ink }}>{ipne ? ipne.score : "–"}</Txt>
              <Txt variante="fraco">/ 100</Txt>
              {ipne ? <Txt style={{ fontFamily: FONTE.forte, color: c.amber, marginLeft: 8, flexShrink: 1 }}>{ipne.nivel}</Txt> : null}
            </View>

            {ipne ? (
              <>
                <Txt style={{ fontFamily: FONTE.media, marginTop: 4 }}>{ipne.manchete}</Txt>
                <View accessible accessibilityLabel={r.nome + " tem " + numero(r.instalacoes) + " instalações; o esperado pelo perfil é cerca de " + numero(ipne.referencia) + "."}
                  style={{ marginTop: 8 }}>
                  <Barra rotulo="Hoje" valor={r.instalacoes} max={Math.max(r.instalacoes, ipne.referencia)} cor={c.petrol} />
                  <Barra rotulo="Esperado pelo perfil" valor={ipne.referencia} max={Math.max(r.instalacoes, ipne.referencia)} cor={c.amber} />
                </View>
                {ipne.contexto ? <Aviso>{ipne.contexto}</Aviso> : null}
              </>
            ) : (
              <Txt variante="fraco" style={{ marginTop: 8 }}>{semIPNE(r)}</Txt>
            )}

            {r.tipo === "municipio" ? (
              <View style={{ marginTop: 14, gap: 4 }}>
                {ipne ? (
                  <Pressable onPress={() => router.navigate({ pathname: "/rankings", params: { porte: "0", uf: "" } })}
                    accessibilityRole="link" style={{ alignSelf: "flex-start" }}>
                    <View style={{ backgroundColor: c.track, borderRadius: RAIO, paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Txt style={{ fontFamily: FONTE.media, fontSize: T.sm }}>
                        {numero(ipne.posicao) + "º de " + numero(ipne.total) + " em oportunidade"}
                      </Txt>
                    </View>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setVerSemelhantes((v) => !v)} accessibilityRole="button"
                  accessibilityState={{ expanded: verSemelhantes }} style={{ paddingVertical: 8 }}>
                  <Txt variante="link">{verSemelhantes ? "Ocultar cidades com perfil semelhante" : "Ver cidades com perfil semelhante →"}</Txt>
                </Pressable>
                {verSemelhantes ? <Semelhantes r={r} aoAbrir={abreNoExplorar} /> : null}
              </View>
            ) : (
              <Pressable onPress={() => router.navigate({ pathname: "/rankings", params: { uf: r.uf, porte: "0" } })}
                accessibilityRole="link" style={{ paddingTop: 8 }}>
                <Txt variante="link">{"Ver os municípios com maior oportunidade em " + r.nome + " →"}</Txt>
              </Pressable>
            )}
          </Cartao>

          <Secao titulo="Indicadores">
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
              <Metrica rotulo="Instalações" par={compacto(r.instalacoes)} delta={deltaInst} destaque />
              <Metrica rotulo="Instalações por 1.000 hab." par={{ valor: numero(r.inst_por_mil_hab, 1), unidade: "inst." }} destaque />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
              <Metrica rotulo="Potência instalada" par={potencia(r.potencia_kw)} delta={deltaPot} />
              <Metrica rotulo="Potência por habitante" par={{ valor: numero(r.kw_por_hab, 2), unidade: "kW" }} />
              <Metrica rotulo="População" par={compacto(r.populacao)} />
              <Metrica rotulo="PIB" par={{ prefixo: "R$", ...compacto(r.pib_mil_reais * 1000) }} />
            </View>
          </Secao>

          <Secao titulo="Evolução">
            <Segmentado
              opcoes={[{ valor: "acumulado", titulo: "Instalações" }, { valor: "potencia_kw_acumulada", titulo: "Potência" }]}
              valor={metrica}
              aoMudar={setMetrica}
            />
            <View style={{ marginTop: 16 }}>
              <Grafico serie={dados.serie} metrica={metrica} />
            </View>
          </Secao>

          {fonte ? <Txt variante="legenda" style={{ marginTop: 24 }}>{fonte}</Txt> : null}
        </>
      ) : null}
    </Tela>
  );
}
