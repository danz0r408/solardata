// Formulário de login e cadastro (mesmas validações e rotas do site)
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { api } from "../lib/api";
import { useApp } from "../lib/estado";
import Marca from "./Marca";
import { Aviso, Botao, Campo, Tela, Txt } from "./ui";
import { FONTE } from "../lib/tema";

function CampoSenha(props) {
  const [ver, setVer] = useState(false);
  return (
    <Campo
      {...props}
      secureTextEntry={!ver}
      autoCapitalize="none"
      autoCorrect={false}
      direita={(
        <Pressable onPress={() => setVer((v) => !v)} hitSlop={8} style={{ paddingHorizontal: 14 }}
          accessibilityRole="button" accessibilityState={{ checked: ver }} accessibilityLabel={ver ? "Ocultar senha" : "Mostrar senha"}>
          <Txt variante="link">{ver ? "Ocultar" : "Mostrar"}</Txt>
        </Pressable>
      )}
    />
  );
}

export default function FormConta({ modo }) {
  const router = useRouter();
  const { entra } = useApp();
  const cadastro = modo === "cadastro";
  const [v, setV] = useState({ nome: "", email: "", senha: "", confirma: "" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [esqueci, setEsqueci] = useState(false);
  const muda = (k) => (t) => setV((x) => ({ ...x, [k]: t }));

  function valida() {
    if (!cadastro) return !v.email.trim() || !v.senha ? "Informe e-mail e senha." : null;
    if (v.nome.trim().length < 2) return "Informe seu nome.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return "Informe um e-mail válido.";
    if (v.senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (v.senha !== v.confirma) return "As senhas não conferem.";
    return null;
  }

  async function envia() {
    const problema = valida();
    setErro(problema || "");
    if (problema) return;
    setEnviando(true);
    try {
      const corpo = cadastro
        ? { nome: v.nome.trim(), email: v.email.trim(), senha: v.senha }
        : { email: v.email.trim(), senha: v.senha };
      const dados = await api(cadastro ? "/auth/cadastro" : "/auth/login", { metodo: "POST", corpo, publica: true });
      entra(dados);
      router.replace("/inicio");
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Tela bordas={["top", "bottom"]}>
        <View style={{ paddingTop: 40, gap: 12 }}>
          <Marca tamanho={44} />
          <Txt variante="titulo" accessibilityRole="header">{cadastro ? "Criar conta" : "Entrar na sua conta"}</Txt>
          <Txt variante="fraco">
            {cadastro
              ? "Acesse o potencial de energia solar de cada município do Brasil."
              : "Inteligência de mercado em energia solar, município por município."}
          </Txt>
        </View>

        {cadastro ? <Campo rotulo="Nome" value={v.nome} onChangeText={muda("nome")} autoComplete="name" textContentType="name" /> : null}
        <Campo rotulo="E-mail" value={v.email} onChangeText={muda("email")} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <CampoSenha rotulo="Senha" value={v.senha} onChangeText={muda("senha")}
          textContentType={cadastro ? "newPassword" : "password"} onSubmitEditing={cadastro ? undefined : envia} />
        {cadastro ? <CampoSenha rotulo="Confirmar senha" value={v.confirma} onChangeText={muda("confirma")} onSubmitEditing={envia} /> : null}

        {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

        <Botao titulo={cadastro ? "Criar conta" : "Entrar"} onPress={envia} carregando={enviando} style={{ marginTop: 24 }} />

        {!cadastro ? (
          <Pressable onPress={() => setEsqueci(true)} style={{ paddingVertical: 14, alignSelf: "center" }} accessibilityRole="button">
            <Txt variante="link">Esqueci minha senha</Txt>
          </Pressable>
        ) : null}
        {esqueci ? <Aviso>Recuperação por e-mail em breve. Fale com o administrador do SolarData.</Aviso> : null}

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 24 }}>
          <Txt variante="fraco">{cadastro ? "Já tem conta?" : "Não tem conta?"}</Txt>
          <Pressable onPress={() => router.replace(cadastro ? "/login" : "/cadastro")} hitSlop={8} accessibilityRole="link">
            <Txt variante="link" style={{ fontFamily: FONTE.forte }}>{cadastro ? "Entrar" : "Cadastre-se"}</Txt>
          </Pressable>
        </View>
      </Tela>
    </KeyboardAvoidingView>
  );
}
