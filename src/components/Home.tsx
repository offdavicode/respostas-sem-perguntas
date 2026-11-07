"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import {
  createRoomRequest,
  joinRoomRequest,
  loadAvatar,
  loadName,
  saveAvatar,
  saveName,
  saveSession,
} from "@/lib/client/api";
import { type Avatar, DEFAULT_AVATAR } from "@/lib/game/avatar";
import { AvatarEditor } from "./AvatarEditor";
import { InstallApp } from "./InstallApp";

function Cube({ variant = "", label = "?" }: { variant?: string; label?: string }) {
  return (
    <div className={`cube ${variant}`} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div className="cube-face" key={i}>
          {i < 4 ? label : ""}
        </div>
      ))}
    </div>
  );
}

export function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setName(loadName());
      setAvatar(loadAvatar());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function changeAvatar(next: Avatar) {
    setAvatar(next);
    saveAvatar(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      saveName(name.trim());
      const cleanCode = code.trim().toUpperCase();
      const session =
        tab === "create"
          ? await createRoomRequest(name, avatar)
          : await joinRoomRequest(cleanCode, name, avatar);
      saveSession(session);
      router.push(`/sala/${session.code}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Algo deu errado.");
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <section className="hero">
        <div className="scene">
          <Cube />
          <Cube variant="small coral" />
          <Cube variant="small mint" label="!" />
        </div>
        <h1>
          Respostas <em>sem</em> Perguntas
        </h1>
        <p className="hero-lead">
          A pergunta existe, mas está escondida. Revele palavra por palavra e responda antes dos
          seus amigos.
        </p>
        <ol className="rules">
          <li>
            <b>1</b> Você só sabe quantas palavras a pergunta tem.
          </li>
          <li>
            <b>2</b> Escolha uma palavra para revelar e tente responder.
          </li>
          <li>
            <b>3</b> Quanto menos palavras reveladas, mais pontos.
          </li>
        </ol>
        <div className="hero-actions">
          <Link className="button block block-mint" href="/desafio">
            Pergunta do dia
          </Link>
          <InstallApp />
        </div>
      </section>

      <section className="block panel">
        <div className="tabs" role="tablist" aria-label="Como jogar">
          <button
            type="button"
            className="tab"
            role="tab"
            aria-selected={tab === "create"}
            onClick={() => setTab("create")}
          >
            Criar sala
          </button>
          <button
            type="button"
            className="tab"
            role="tab"
            aria-selected={tab === "join"}
            onClick={() => setTab("join")}
          >
            Entrar
          </button>
        </div>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            Seu apelido
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={16}
              required
              autoComplete="nickname"
              placeholder="Como vão te chamar?"
            />
          </label>
          {tab === "join" && (
            <label className="field">
              Código da sala
              <input
                className="input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={4}
                minLength={4}
                required
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="ABCD"
              />
            </label>
          )}
          <AvatarEditor avatar={avatar} onChange={changeAvatar} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button block block-yellow" disabled={busy}>
            {tab === "create" ? "Criar sala" : "Entrar na sala"}
          </button>
        </form>
      </section>
    </main>
  );
}
