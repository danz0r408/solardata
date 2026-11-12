// Perfil: conta, aparência, edição do nome, como ler o IPNE, fontes dos dados e saída
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api, ignoravel, URL_BASE } from "../../lib/api";
import { useApp, useCores } from "../../lib/estado";
import { iniciais, numero } from "../../lib/fmt";
import { FONTE, T } from "../../lib/tema";
import { Aviso, Botao, Campo, Cartao, Secao, Segmentado, Tela, Txt } from "../../components/ui";

// Parágrafo com trechos em negrito: [["texto"], ["negrito", true], ...]
function P({ partes }) {
  return (
    <Txt variante="fraco" style={{ marginTop: 10 }}>
      {partes.map(([t, b], i) => <Txt key={i} variante="fraco" style={b ? { fontFamily: FONTE.forte } : null}>{t}</Txt>)}
    </Txt>
  );
}

function Expansivel({ titulo, aberto, aoAlternar, children }) {
  const c = useCores();
  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
      <Pressable onPress={aoAlternar} accessibilityRole="button" accessibilityState={{ expanded: aberto }}
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 }}>
        <Txt variante="forte">{titulo}</Txt>
        <Txt style={{ color: c.petrol, fontSize: T.lg }}>{aberto ? "−" : "+"}</Txt>
      </Pressable>
      {aberto ? <View style={{ paddingBottom: 16 }}>{children}</View> : null}
    </View>
  );
}

export default function Perfil() {
  const router = useRouter();
  const app = useApp();
  const c = useCores();
  const params = useLocalSearchParams();
  const [nome, setNome] = useState(app.usuario ? app.usuario.nome : "");
  const [msg, setMsg] = useState({ ok: false, erro: "" });
  const [salvando, setSalvando] = useState(false);
  const [modelo, setModelo] = useState({ ipne: "", ml: "" });
  const [abertos, setAbertos] = useState({ ipne: false, dados: false });

  // link do ⓘ do Início: abre direto a explicação do IPNE
  useEffect(() => { if (params.secao === "como-ler") setAbertos((a) => ({ ...a, ipne: true })); }, [params.secao]);

  useEffect(() => {
    const controle = new AbortController();
    api("/auth/me", { signal: controle.signal })
      .then((u) => { app.atualizaUsuario(u); setNome(u.nome); })
      .catch(() => { /* fica com a cópia salva */ });

    // Transparência do modelo: R² e período
    api("/modelo", { signal: controle.signal }).then((m) => {
      if (!m || m.r2 == null) return;
      const validacao = m.r2_validacao_cruzada != null
        ? " (" + numero(m.r2_validacao_cruzada, 2) + " em validação cruzada, com municípios que o modelo não viu)" : "";
      const ipne = "Modelo atual: regressão com " + numero(m.n_municipios) + " municípios, que explica " +
        Math.round(m.r2 * 100) + "% da variação entre eles" + validacao + ". PIB " + m.ano_pib +
        ", Censo " + m.ano_populacao_modelo + (m.ano_irradiacao ? ", INPE " + m.ano_irradiacao : "") +
        ", base ANEEL " + m.periodo_referencia + ".";
      const ml = m.ml && m.ml.r2_mw != null
        ? "Machine Learning: " + numero(m.ml.n_municipios) + " municípios, explica " + Math.round(m.ml.r2_mw * 100) +
          "% da variação da potência, com erro médio de " + numero(m.ml.erro_medio_mw, 1) + " MW (estimativas fora da amostra)."
        : "";
      setModelo({ ipne, ml });
    }).catch((e) => { if (!ignoravel(e)) { /* informação complementar */ } });
    return () => controle.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function salva() {
    setMsg({ ok: false, erro: "" });
    setSalvando(true);
    try {
      const u = await api("/auth/me", { metodo: "PATCH", corpo: { nome } });
      app.atualizaUsuario(u);
      setNome(u.nome);
      setMsg({ ok: true, erro: "" });
    } catch (e) {
      if (!ignoravel(e)) setMsg({ ok: false, erro: e.message });
    }
    setSalvando(false);
  }

  const u = app.usuario || { nome: "", email: "" };
  const alterna = (k) => () => setAbertos((a) => ({ ...a, [k]: !a[k] }));

  return (
    <Tela>
      <Txt variante="titulo" accessibilityRole="header" style={{ marginTop: 16 }}>Perfil</Txt>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 20 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.petrol, alignItems: "center", justifyContent: "center" }}>
          <Txt style={{ fontFamily: FONTE.forte, fontSize: T.lg, color: c.onPetrol }}>{iniciais(u.nome)}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variante="forte" style={{ fontSize: T.lg }} numberOfLines={1}>{u.nome}</Txt>
          <Txt variante="fraco" numberOfLines={1}>{u.email}</Txt>
        </View>
      </View>

      <Secao titulo="Aparência">
        <Segmentado
          opcoes={[{ valor: "sistema", titulo: "Sistema" }, { valor: "claro", titulo: "Claro" }, { valor: "escuro", titulo: "Escuro" }]}
          valor={app.tema}
          aoMudar={app.defineTema}
        />
      </Secao>

      <Secao titulo="Editar perfil">
        <Cartao>
          <View style={{ marginTop: -16 }}>
            <Campo rotulo="Nome" value={nome} onChangeText={(t) => { setNome(t); setMsg({ ok: false, erro: "" }); }}
              autoComplete="name" onSubmitEditing={salva} />
          </View>
          {msg.erro ? <Aviso tipo="erro">{msg.erro}</Aviso> : null}
          {msg.ok ? <Txt variante="fraco" style={{ color: c.petrol, marginTop: 10 }} accessibilityLiveRegion="polite">Nome atualizado.</Txt> : null}
          <Botao titulo="Salvar" onPress={salva} carregando={salvando} style={{ marginTop: 16 }} />
        </Cartao>
      </Secao>

      <View style={{ marginTop: 24 }}>
        <Expansivel titulo="Como ler o IPNE" aberto={abertos.ipne} aoAlternar={alterna("ipne")}>
          <P partes={[["O "], ["IPNE", true], [" (Índice de Potencial Não Explorado) compara quantas instalações solares o município tem hoje com o "],
            ["esperado pelo perfil", true], [": quantas um município com essa renda, PIB, população, densidade, domicílios e sol costuma ter, comparando com os outros municípios do mesmo estado. O esperado vem de um modelo estatístico; não é a média de uma lista de cidades."]]} />
          <P partes={[["A nota vai de 0 a 100. Quanto maior, "], ["mais espaço para crescer", true],
            [": perto de 100, a cidade tem muito menos instalações que o esperado pelo perfil (alta oportunidade). Perto de 0, já tem mais que o esperado (mercado maduro)."]]} />
          <P partes={[["Cidades com perfil semelhante", true], [" (no Início): os municípios do Brasil todo com população, PIB per capita, renda, densidade e domicílios mais próximos. Servem para comparar pares; não entram no cálculo do IPNE."]]} />
          <P partes={[["Indica onde investigar, não garante demanda. Fatores fora do modelo, como a proporção de apartamentos, a tarifa local ou a atuação da distribuidora, também explicam diferenças. Por isso o app mostra um alerta quando a cidade é muito densa ou o mercado é pequeno."]]} />
          <P partes={[["Estimativa por Machine Learning", true], [" (aba Explorar): um segundo modelo, Random Forest, estima a potência em MW que o município comportaria. O IPNE mostra o espaço em número de instalações; o Machine Learning mostra a ordem de grandeza em MW (o \"espaço em potência\"). Nas cidades com mais de 1 milhão de habitantes, a estimativa é menos confiável."]]} />
          {modelo.ipne ? <Txt variante="legenda" style={{ marginTop: 12 }}>{modelo.ipne}</Txt> : null}
          {modelo.ml ? <Txt variante="legenda" style={{ marginTop: 6 }}>{modelo.ml}</Txt> : null}
        </Expansivel>
        <Expansivel titulo="Sobre os dados" aberto={abertos.dados} aoAlternar={alterna("dados")}>
          <P partes={[["ANEEL", true], [": empreendimentos de micro e minigeração distribuída solar (UFV). A evolução anual usa a data de atualização cadastral, a única data disponível na fonte, como aproximação da data de conexão."]]} />
          <P partes={[["IBGE", true], [": PIB dos municípios (SIDRA 5938), população estimada (SIDRA 6579) e Censo 2022 (população, densidade, domicílios e renda domiciliar per capita)."]]} />
          <P partes={[["INPE", true], [": Atlas Brasileiro de Energia Solar 2017 (irradiação global horizontal na sede do município)."]]} />
          <P partes={[["Processamento no Databricks (camadas bronze, silver e gold). O app lê apenas tabelas agregadas por município: nenhum dado pessoal de titulares é exibido."]]} />
          <Txt variante="legenda" style={{ marginTop: 12 }}>{"API: " + URL_BASE}</Txt>
        </Expansivel>
      </View>

      <Botao titulo="Sair da conta" tipo="secundario" style={{ marginTop: 32 }}
        onPress={() => { app.sai(); router.replace("/login"); }} />
    </Tela>
  );
}
