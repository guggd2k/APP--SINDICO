"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { initialData } from "@/lib/initial-data";
import type { AccessVisit, AppData, Condo, DailyVisit, MaintenanceStatus, Section, StockCategory, StockItem, StockMovementType } from "@/lib/types";
import { loadPhotoUrls, savePhotos } from "@/lib/photo-storage";
import { loadCloudData, queueCloudSync } from "@/lib/cloud-data";
import { getSupabaseClient, supabaseConfigured } from "@/lib/supabase";

const storageKey = "gestao-condominial-v1";
const emptyPhotoIds: string[] = [];
const emptyData: AppData = { condos: [], dailyVisits: [], maintenance: [], stock: [], movements: [] };
const subscribeToHydration = () => () => {};
const getHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function readStoredData(key = storageKey): { data: AppData; notice: string } {
  const fallback = key === storageKey ? initialData : emptyData;
  if (typeof window === "undefined") return { data: fallback, notice: "" };
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return { data: fallback, notice: "" };
    const parsed = JSON.parse(saved) as AppData & { visits?: AccessVisit[] };
    if (!Array.isArray(parsed.condos) || (!parsed.condos.length && key === storageKey) || !Array.isArray(parsed.maintenance) || !Array.isArray(parsed.stock)) {
      return { data: fallback, notice: "Os dados salvos estão inválidos. Os dados iniciais serão restaurados." };
    }
    return {
      data: {
        ...parsed,
        dailyVisits: Array.isArray(parsed.dailyVisits) ? parsed.dailyVisits : [],
        accessHistory: parsed.accessHistory ?? parsed.visits ?? [],
        maintenance: parsed.maintenance.map((item) => ({
          ...item,
          scheduledAt: item.scheduledAt ?? new Date(`${item.dueDate || todayISO()}T09:00:00`).toISOString(),
          durationMinutes: item.durationMinutes ?? 60,
          createdAt: item.createdAt ?? new Date().toISOString(),
        })),
        movements: Array.isArray(parsed.movements) ? parsed.movements : [],
      },
      notice: "",
    };
  } catch {
    return { data: fallback, notice: "Não foi possível carregar os dados salvos. Os dados iniciais serão restaurados." };
  }
}

function AuthScreen({ onDemo, notice }: { onDemo: () => void; notice: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const allowDemo = process.env.NODE_ENV === "development";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) {
      setMessage("Configure as credenciais do Supabase para habilitar contas de síndico.");
      return;
    }

    const values = new FormData(event.currentTarget);
    const email = String(values.get("email")).trim();
    const password = String(values.get("password"));
    const name = String(values.get("name")).trim();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) setMessage("Conta criada. Confirme seu e-mail para entrar.");
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível autenticar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark"><Icon name="building" size={21} /></div><div><strong>mf</strong><span>GESTÃO CONDOMINIAL</span></div></div>
    <div className="panel-kicker">ESPAÇO DO SÍNDICO</div><h1>{mode === "login" ? "Acesse sua conta" : "Crie sua conta"}</h1>
    <p className="auth-description">{mode === "login" ? "Entre para acompanhar seus condomínios e a rotina da equipe." : "Cadastre uma conta individual para administrar seus condomínios."}</p>
    <form className="auth-form" onSubmit={submit}>
      {mode === "signup" && <label>Nome completo<input name="name" autoComplete="name" required maxLength={120} placeholder="Seu nome" /></label>}
      <label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="voce@exemplo.com" /></label>
      <label>Senha<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required placeholder="Mínimo de 8 caracteres" /></label>
      {(message || notice) && <p className="auth-message" role="status">{message || notice}</p>}
      <button className="button button-primary auth-submit" type="submit" disabled={!supabaseConfigured || busy}>{busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}</button>
    </form>
    {supabaseConfigured
      ? <>
        <button className="auth-mode" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}</button>
        {allowDemo && <div className="auth-setup"><strong>Prévia local</strong><span>Use dados de demonstração salvos somente neste dispositivo, sem conectar sua conta.</span><button className="button button-quiet" onClick={onDemo}>Continuar na demonstração local</button></div>}
      </>
      : <div className="auth-setup"><strong>Login ainda não configurado</strong><span>Adicione as credenciais do Supabase no arquivo .env.local para criar contas individuais. A demonstração atual continua disponível neste dispositivo.</span><button className="button button-quiet" onClick={onDemo}>Continuar na demonstração local</button></div>}
  </section></main>;
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, ReactNode> = {
    home: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
    visits: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6m3-3h-6" /></>,
    maintenance: <><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 12l-3-3z" /><path d="m17 7 3-3m-1 0h1v1" /></>,
    stock: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    reports: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /><path d="M16 9h3v3" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14m-7-7h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    prev: <path d="m15 18-6-6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3" /></>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4" /></>,
  };
  return <svg {...common}>{paths[name] ?? paths.home}</svg>;
}

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: "inicio", label: "Visão geral", icon: "home" },
  { id: "visitas", label: "Visitas", icon: "visits" },
  { id: "agenda", label: "Agenda", icon: "calendar" },
  { id: "manutencoes", label: "Manutenções", icon: "maintenance" },
  { id: "estoque", label: "Estoque", icon: "stock" },
  { id: "relatorios", label: "Relatórios", icon: "reports" },
];

const visitAreas = ["Portaria", "Hall e corredores", "Elevadores", "Escadas", "Garagem", "Iluminação", "Hidráulica", "Área de lazer", "Piscina", "Jardins", "Limpeza"];
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayISO = () => localDate(new Date());
const currentTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};
const dateFromISO = (value: string) => new Date(`${value}T12:00:00`);
const getWeekDates = (value: string) => {
  const date = dateFromISO(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(date.getDate() + index);
    return localDate(day);
  });
};
const formatWeekday = (value: string) => dateFromISO(value).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
const formatLongDate = (value: string) => dateFromISO(value).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
const getEndTime = (start: string, durationMinutes: number) => {
  const end = new Date(new Date(start).getTime() + durationMinutes * 60_000);
  return end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const makeId = () => crypto.randomUUID();
const formatTime = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const validatePhotos = (files: File[]) => {
  if (files.length > 5) return "Anexe no máximo 5 fotos por registro.";
  if (files.some((file) => !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif", "image/bmp"].includes(file.type))) return "Use fotos JPEG, PNG, WebP, GIF, AVIF, HEIC ou BMP.";
  if (files.some((file) => file.size > 8 * 1024 * 1024)) return "Cada foto deve ter no máximo 8 MB.";
  return "";
};

export default function Home() {
  const [stored] = useState(readStoredData);
  const [data, setData] = useState<AppData>(stored.data);
  const hydrated = useSyncExternalStore(subscribeToHydration, getHydrationSnapshot, getServerHydrationSnapshot);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [demoMode, setDemoMode] = useState(false);
  const [loadedDataKey, setLoadedDataKey] = useState(supabaseConfigured ? "" : storageKey);
  const [cloudReadyUserId, setCloudReadyUserId] = useState(supabaseConfigured ? "" : "local");
  const [cloudError, setCloudError] = useState("");
  const [cloudReloadKey, setCloudReloadKey] = useState(0);
  const [cloudSyncRetryKey, setCloudSyncRetryKey] = useState(0);
  const [authNotice, setAuthNotice] = useState("");
  const sessionId = session?.user.id;
  const hasSession = Boolean(sessionId);
  const activeStorageKey = sessionId ? `${storageKey}:${sessionId}` : storageKey;
  const dataReady = loadedDataKey === activeStorageKey && (!supabaseConfigured || demoMode || (hasSession && cloudReadyUserId === sessionId));
  const [condoId, setCondoId] = useState(initialData.condos[0].id);
  const [agendaDate, setAgendaDate] = useState(todayISO());
  const [section, setSection] = useState<Section>("inicio");
  const [dialog, setDialog] = useState<"visit" | "maintenance" | "movement" | "item" | "condo" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(stored.notice);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setLoadedDataKey("");
        setCloudReadyUserId("");
      }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthNotice(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || (supabaseConfigured && !hasSession && !demoMode)) return;
    let active = true;
    const client = sessionId ? getSupabaseClient() : null;
    const userName = String(session?.user.user_metadata.full_name ?? session?.user.email?.split("@")[0] ?? "Síndico");
    const loading = client && sessionId
      ? loadCloudData(client, sessionId, userName).then((cloudData) => ({ data: cloudData, notice: "" }))
      : Promise.resolve(readStoredData(activeStorageKey));
    void loading.then((saved) => {
      if (!active) return;
      setData(saved.data);
      setLoadedDataKey(activeStorageKey);
      if (sessionId) {
        setCloudReadyUserId(sessionId);
        setCloudError("");
      } else if (demoMode) {
        setCloudReadyUserId("local");
      }
      if (saved.notice) setToast(saved.notice);
    }).catch((error: unknown) => {
      if (!active) return;
      setCloudError(error instanceof Error ? error.message : "Não foi possível carregar os dados deste condomínio.");
    });
    return () => { active = false; };
  }, [activeStorageKey, authReady, cloudReloadKey, demoMode, hasSession, session, sessionId]);

  useEffect(() => {
    if (!hydrated || !dataReady || loadedDataKey !== activeStorageKey || (supabaseConfigured && !hasSession && !demoMode)) return;
    try {
      window.localStorage.setItem(activeStorageKey, JSON.stringify(data));
    } catch {
      window.dispatchEvent(new CustomEvent("morada-notice", { detail: "Não foi possível salvar os dados deste dispositivo. O armazenamento pode estar cheio ou indisponível." }));
    }
  }, [activeStorageKey, data, dataReady, demoMode, hasSession, hydrated, loadedDataKey]);

  useEffect(() => {
    if (!sessionId || cloudReadyUserId !== sessionId || !dataReady) return;
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void queueCloudSync(client, data, sessionId).then(() => {
        if (active) setCloudError("");
      }).catch((error: unknown) => {
        if (active) setCloudError(error instanceof Error ? error.message : "Não foi possível sincronizar os dados com o servidor.");
      });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cloudReadyUserId, cloudSyncRetryKey, data, dataReady, sessionId]);
  useEffect(() => {
    const onNotice = (event: Event) => {
      const notice = (event as CustomEvent<string>).detail;
      if (notice) setToast(notice);
    };
    window.addEventListener("morada-notice", onNotice);
    return () => window.removeEventListener("morada-notice", onNotice);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        setToast("Não foi possível ativar o modo instalável neste navegador.");
      });
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const condo = data.condos.find((item) => item.id === condoId) ?? data.condos[0];
  const hasCondo = Boolean(condo);
  const accountName = String(session?.user.user_metadata.full_name ?? session?.user.email?.split("@")[0] ?? "Síndico");
  const accountInitials = accountName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "").join("");
  const photoScope = session?.user.id ?? "demo";
  const visits = useMemo(() => data.dailyVisits.filter((item) => item.condoId === condoId), [data.dailyVisits, condoId]);
  const maintenance = useMemo(() => data.maintenance.filter((item) => item.condoId === condoId), [data.maintenance, condoId]);
  const stock = useMemo(() => data.stock.filter((item) => item.condoId === condoId), [data.stock, condoId]);
  const todayVisits = visits.filter((item) => localDate(new Date(item.visitedAt)) === todayISO());
  const openTasks = maintenance.filter((item) => item.status !== "Concluída");
  const lowStock = stock.filter((item) => item.quantity <= item.minimum);

  const updateData = (updater: (current: AppData) => AppData) => setData((current) => updater(current));
  const signOut = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setToast(error.message);
  };
  const createVisit = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const visitedDate = String(values.get("visitedDate"));
    const visitedTime = String(values.get("visitedTime"));
    const activities = String(values.get("activities")).split(/\r?\n/).map((activity) => activity.trim()).filter(Boolean);
    const checkedAreas = values.getAll("checkedArea").map(String);
    const attentionAreas = values.getAll("attentionArea").map(String);
    const responsible = String(values.get("responsible")).trim();
    const notes = String(values.get("notes")).trim();
    const photoFiles = values.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const visitedAt = new Date(`${visitedDate}T${visitedTime}:00`);
    if (!visitedDate || !visitedTime || Number.isNaN(visitedAt.getTime()) || !responsible || (!activities.length && !checkedAreas.length && !notes) || !photoFiles.length) {
      setToast("Informe a data, o responsável, uma atividade ou área e pelo menos uma foto da visita.");
      return;
    }
    const photoError = validatePhotos(photoFiles);
    if (photoError) { setToast(photoError); return; }
    const id = makeId();
    let photos: string[];
    try {
      photos = await savePhotos(photoFiles, photoScope, condoId, id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível salvar as fotos da visita.");
      return;
    }
    const next: DailyVisit = { id, condoId, visitedAt: visitedAt.toISOString(), responsible, activities, checkedAreas, attentionAreas, notes, photos, registeredBy: accountName, createdById: sessionId, recordedAt: new Date().toISOString() };
    updateData((current) => ({ ...current, dailyVisits: [next, ...current.dailyVisits] }));
    setDialog(null);
    setToast("Visita diária registrada.");
  };
  const createMaintenance = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const scheduledDate = String(values.get("scheduledDate"));
    const scheduledTime = String(values.get("scheduledTime"));
    const durationMinutes = Number(values.get("durationMinutes"));
    const assignee = String(values.get("assignee")).trim() || "A definir";
    const title = String(values.get("title")).trim();
    const location = String(values.get("location")).trim();
    const photoFiles = values.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`);
    if (!title || !location || !scheduledDate || !scheduledTime || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 || Number.isNaN(scheduledAt.getTime())) {
      setToast("Confira o serviço, local, data, horário e duração da manutenção.");
      return;
    }
    if (!photoFiles.length) {
      setToast("Anexe pelo menos uma foto para registrar a manutenção.");
      return;
    }
    const photoError = validatePhotos(photoFiles);
    if (photoError) { setToast(photoError); return; }
    const startMinutes = scheduledAt.getHours() * 60 + scheduledAt.getMinutes();
    const overlaps = maintenance.some((item) => {
      if (item.assignee.toLocaleLowerCase("pt-BR") !== assignee.toLocaleLowerCase("pt-BR") || item.status === "Concluída") return false;
      const itemStart = new Date(item.scheduledAt);
      if (Number.isNaN(itemStart.getTime()) || localDate(itemStart) !== scheduledDate) return false;
      const itemStartMinutes = itemStart.getHours() * 60 + itemStart.getMinutes();
      return startMinutes < itemStartMinutes + item.durationMinutes && itemStartMinutes < startMinutes + durationMinutes;
    });
    if (overlaps) {
      setToast(`${assignee} já tem uma manutenção agendada nesse horário.`);
      return;
    }
    const id = makeId();
    let photos: string[];
    try {
      photos = await savePhotos(photoFiles, photoScope, condoId, id);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Não foi possível salvar as fotos da manutenção.");
      return;
    }
    updateData((current) => ({
      ...current,
      maintenance: [{
        id, condoId, title, location, photos, createdBy: accountName, createdById: sessionId,
        assignee, priority: String(values.get("priority")) as "Baixa" | "Média" | "Alta",
        dueDate: String(values.get("dueDate")) || scheduledDate, scheduledAt: scheduledAt.toISOString(), durationMinutes,
        status: "Aberta", createdAt: new Date().toISOString(),
      }, ...current.maintenance],
    }));
    setAgendaDate(scheduledDate);
    setDialog(null);
    setToast("Manutenção agendada.");
  };
  const changeMaintenanceStatus = (id: string, status: MaintenanceStatus) => {
    updateData((current) => ({ ...current, maintenance: current.maintenance.map((item) => item.id === id ? { ...item, status } : item) }));
    setToast(`Manutenção atualizada: ${status.toLowerCase()}.`);
  };
  const moveStock = (form: HTMLFormElement) => {
    const values = new FormData(form);
    const itemId = String(values.get("itemId"));
    const quantity = Number(values.get("quantity"));
    const type = String(values.get("type")) as StockMovementType;
    const item = stock.find((entry) => entry.id === itemId);
    if (!item || !Number.isInteger(quantity) || quantity <= 0 || (type === "Saída" && quantity > item.quantity)) {
      setToast("Confira o item e a quantidade informada.");
      return;
    }
    updateData((current) => ({
      ...current,
      stock: current.stock.map((entry) => entry.id === itemId ? { ...entry, quantity: entry.quantity + (type === "Entrada" ? quantity : -quantity) } : entry),
      movements: [{ id: makeId(), condoId, itemId, type, quantity, createdAt: new Date().toISOString(), note: String(values.get("note")).trim() }, ...(current.movements ?? [])],
    }));
    setDialog(null);
    setToast(`${type} registrada no estoque.`);
  };
  const createStockItem = (form: HTMLFormElement) => {
    const values = new FormData(form);
    const name = String(values.get("name")).trim();
    const category = String(values.get("category")) as StockCategory;
    const quantity = Number(values.get("quantity"));
    const minimum = Number(values.get("minimum"));
    const unit = String(values.get("unit")).trim() || "un.";
    if (!name || !Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(minimum) || minimum < 0) {
      setToast("Informe um material e quantidades inteiras iguais ou maiores que zero.");
      return;
    }
    if (stock.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
      setToast("Já existe um material com esse nome neste condomínio.");
      return;
    }
    const itemId = makeId();
    const movements = quantity > 0
      ? [{ id: makeId(), condoId, itemId, type: "Entrada" as const, quantity, createdAt: new Date().toISOString(), note: "Saldo inicial" }]
      : [];
    const item: StockItem = { id: itemId, condoId, name, category, quantity, unit, minimum };
    updateData((current) => ({ ...current, stock: [item, ...current.stock], movements: [...movements, ...(current.movements ?? [])] }));
    setDialog(null);
    setToast("Material cadastrado no estoque.");
  };
  const createCondo = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const name = String(values.get("name")).trim();
    const cep = String(values.get("cep")).replace(/\D/g, "");
    const street = String(values.get("street")).trim();
    const number = String(values.get("number")).trim();
    const complement = String(values.get("complement")).trim();
    const neighborhood = String(values.get("neighborhood")).trim();
    const city = String(values.get("city")).trim();
    const state = String(values.get("state")).trim().toUpperCase();
    const address = [
      [street, number].filter(Boolean).join(", ") + (complement ? ` - ${complement}` : ""),
      neighborhood,
      city && state ? `${city}/${state}` : city || state,
      cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : "",
    ].filter(Boolean).join(" · ");
    if (name.length < 2) {
      setToast("Informe um nome de condomínio com pelo menos 2 caracteres.");
      return;
    }
    if (cep.length !== 8 || values.get("cepLookupComplete") !== "true" || !city || !state) {
      setToast("Pesquise um CEP válido e confirme os dados do endereço antes de cadastrar.");
      return;
    }
    if (data.condos.some((item) => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
      setToast("Já existe um condomínio com esse nome.");
      return;
    }
    try {
      const client = session ? getSupabaseClient() : null;
      let id = makeId();
      if (session && client) {
        const { data: createdId, error } = await client.rpc("create_condo_for_current_user", {
          condo_name: name,
          condo_address: address,
        });
        if (error) {
          setToast(`Não foi possível cadastrar o condomínio: ${error.message}`);
          return;
        }
        id = createdId;
      }
      const next: Condo = { id, name, address };
      updateData((current) => ({ ...current, condos: [...current.condos, next] }));
      setCondoId(next.id);
      setSection("inicio");
      setDialog(null);
      setToast("Condomínio cadastrado. Agora você pode registrar sua rotina.");
    } catch (error) {
      setToast(error instanceof Error ? `Não foi possível cadastrar o condomínio: ${error.message}` : "Não foi possível cadastrar o condomínio.");
    }
  };

  const goTo = (next: Section) => { setSection(next); setMobileNav(false); setQuery(""); };
  const title = navItems.find((item) => item.id === section)?.label ?? "Visão geral";
  const filteredVisits = visits.filter((item) => `${item.responsible} ${item.activities.join(" ")} ${item.checkedAreas.join(" ")} ${item.attentionAreas.join(" ")} ${item.notes}`.toLowerCase().includes(query.toLowerCase()));
  const filteredMaintenance = maintenance.filter((item) => `${item.title} ${item.location} ${item.assignee} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const filteredStock = stock.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const headingAction = !hasCondo
    ? { label: "Cadastrar condomínio", action: () => setDialog("condo") }
    : section === "manutencoes"
    ? { label: "Nova manutenção", action: () => setDialog("maintenance") }
    : section === "agenda"
      ? { label: "Agendar manutenção", action: () => setDialog("maintenance") }
    : section === "estoque"
      ? { label: "Cadastrar material", action: () => setDialog("item") }
      : section === "relatorios"
        ? { label: "Ver estoque", action: () => goTo("estoque") }
        : { label: "Registrar visita", action: () => setDialog("visit") };
  const openNewMaintenance = () => {
    setDialog("maintenance");
  };

  if (!hydrated || !authReady || (session && !dataReady)) {
    if (session && cloudError && cloudReadyUserId !== sessionId) {
      return <main className="auth-page"><section className="auth-card"><div className="panel-kicker">DADOS DO CONDOMÍNIO</div><h1>Não foi possível conectar</h1><p className="auth-description">{cloudError}</p><div className="auth-actions"><button className="button button-primary" onClick={() => { setCloudError(""); setCloudReloadKey((value) => value + 1); }}>Tentar novamente</button><button className="button button-quiet" onClick={signOut}>Sair da conta</button></div></section></main>;
    }
    return <main className="app-shell" aria-busy="true"><div className="loading-screen">Carregando gestão condominial...</div></main>;
  }
  if (!session && !demoMode) {
    return <AuthScreen notice={authNotice} onDemo={() => setDemoMode(true)} />;
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Icon name="building" size={21} /></div><div><strong>mf</strong><span>GESTÃO CONDOMINIAL</span></div><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><Icon name="close" /></button></div>
        <div className="workspace-label">ESPAÇO DO SÍNDICO</div>
        <div className="condo-switcher">
          <div className="condo-avatar"><Icon name="building" size={18} /></div>
          <label><span>CONDOMÍNIO ATIVO</span><select aria-label="Selecionar condomínio" value={condoId} onChange={(event) => setCondoId(event.target.value)}>{data.condos.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <span className="select-chevron"><Icon name="chevron" size={15} /></span>
        </div>
        <button className="condo-add" onClick={() => setDialog("condo")}><Icon name="plus" size={14} /> Adicionar condomínio</button>
        <nav className="navigation" aria-label="Navegação principal">
          <span className="nav-caption">MENU PRINCIPAL</span>
          {navItems.map((item) => <button key={item.id} className={`nav-link ${section === item.id ? "nav-link-active" : ""}`} onClick={() => goTo(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span>{item.id === "manutencoes" && openTasks.length > 0 && <span className="nav-count">{openTasks.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Icon name="bell" size={18} /></div><strong>Dia organizado,<br />condomínio em dia.</strong><span>Uma rotina mais leve começa com tudo no lugar.</span></div>
          <div className="profile"><div className="profile-avatar">{accountInitials}</div><div className="profile-copy"><strong>{accountName}</strong><span>{session?.user.email ?? "Modo de demonstração"}</span></div>{session && <button className="profile-logout" onClick={signOut}>Sair</button>}</div>
        </div>
      </aside>
      {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Fechar navegação" />}
      <section className="main-area">
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Icon name="menu" /></button><div className="breadcrumb">Painel <span>/</span> <strong>{title}</strong></div><div className="topbar-right"><span className="today-label"><Icon name="clock" size={16} />{new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</span><button className="icon-button notification-button" aria-label="Notificações"><Icon name="bell" size={19} /><i /></button><div className="topbar-divider" /><div className="profile-avatar top-avatar">{accountInitials}</div></div></header>
        <div className="page-content">
          {session && cloudError && <div className="cloud-sync-warning" role="status"><span>Não foi possível sincronizar os dados: {cloudError}</span><button className="table-action" onClick={() => setCloudSyncRetryKey((value) => value + 1)}>Tentar novamente</button></div>}
          <div className="page-heading"><div><div className="eyebrow"><span className="status-dot" /> SEU DIA, EM ORDEM</div><h1>{section === "inicio" ? `Bom dia, ${accountName.split(" ")[0]}` : title}<span className="heading-period">.</span></h1><p>{!hasCondo ? "Cadastre um condomínio para começar a organizar sua rotina." : section === "inicio" ? `Acompanhe o que acontece no ${condo.name}.` : `${condo.name} · ${condo.address}`}</p></div><button className="button button-primary heading-action" onClick={headingAction.action}><Icon name={section === "relatorios" ? "arrow" : "plus"} size={18} /><span>{headingAction.label}</span></button></div>

          {!hasCondo ? <section className="panel onboarding-panel"><div className="welcome-icon"><Icon name="building" size={20} /></div><h2>Comece cadastrando seu condomínio</h2><p>Os condomínios e registros ficam separados por conta de síndico neste dispositivo.</p><button className="button button-primary" onClick={() => setDialog("condo")}><Icon name="plus" size={17} />Cadastrar primeiro condomínio</button></section> : <>
            {section === "inicio" && <Dashboard condo={condo} userName={accountName} todayVisits={todayVisits} openTasks={openTasks} lowStock={lowStock} maintenance={maintenance} onNavigate={goTo} onNewVisit={() => setDialog("visit")} onNewMaintenance={openNewMaintenance} />}
            {section === "visitas" && <VisitsPage visits={filteredVisits} photoScope={photoScope} query={query} setQuery={setQuery} onNew={() => setDialog("visit")} />}
            {section === "agenda" && <AgendaPage items={maintenance} photoScope={photoScope} selectedDate={agendaDate} onSelectDate={setAgendaDate} onChangeStatus={changeMaintenanceStatus} onNew={openNewMaintenance} />}
            {section === "manutencoes" && <MaintenancePage items={filteredMaintenance} photoScope={photoScope} query={query} setQuery={setQuery} onStatus={changeMaintenanceStatus} onNew={openNewMaintenance} />}
            {section === "estoque" && <StockPage items={filteredStock} movements={(data.movements ?? []).filter((item) => item.condoId === condoId)} query={query} setQuery={setQuery} onNew={() => setDialog("movement")} onAddItem={() => setDialog("item")} />}
            {section === "relatorios" && <ReportsPage visits={visits} maintenance={maintenance} stock={stock} />}
          </>}

          <footer className="page-footer"><span>mf <span className="footer-dot">·</span> Feito para cuidar do que é de todos.</span><span className="local-badge"><span />{session ? "Conta individual · dados neste dispositivo" : "Demonstração local"}</span></footer>
        </div>
      </section>
      {dialog && <Modal type={dialog} items={stock} defaultScheduleDate={section === "agenda" ? agendaDate : todayISO()} defaultResponsible={accountName} onClose={() => setDialog(null)} onVisit={createVisit} onMaintenance={createMaintenance} onMovement={moveStock} onStockItem={createStockItem} onCondo={createCondo} />}
      {toast && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
    </main>
  );
}

function Dashboard({ condo, userName, todayVisits, openTasks, lowStock, maintenance, onNavigate, onNewVisit, onNewMaintenance }: {
  condo: AppData["condos"][number] | undefined; userName: string; todayVisits: DailyVisit[]; openTasks: AppData["maintenance"]; lowStock: AppData["stock"]; maintenance: AppData["maintenance"];
  onNavigate: (section: Section) => void; onNewVisit: () => void; onNewMaintenance: () => void;
}) {
  return <>
    <div className="welcome-strip"><div className="welcome-icon"><Icon name="building" size={20} /></div><div><strong>{condo?.name}</strong><span>{condo?.address}</span></div><span className="welcome-tag">OPERAÇÃO HOJE</span></div>
    <div className="stats-grid">
      <StatCard icon="visits" label="VISITAS REALIZADAS HOJE" value={String(todayVisits.length).padStart(2, "0")} note={todayVisits.length ? "Vistorias e atividades registradas" : "Nenhuma visita registrada"} tone="mint" action={() => onNavigate("visitas")} />
      <StatCard icon="maintenance" label="MANUTENÇÕES ABERTAS" value={String(openTasks.length).padStart(2, "0")} note={openTasks.some((item) => item.priority === "Alta") ? "Há item de alta prioridade" : "Tudo sob acompanhamento"} tone="peach" action={() => onNavigate("manutencoes")} />
      <StatCard icon="stock" label="ITENS PARA REPOR" value={String(lowStock.length).padStart(2, "0")} note={lowStock.length ? "Abaixo do estoque mínimo" : "Estoque dentro do mínimo"} tone="lavender" action={() => onNavigate("estoque")} />
    </div>
    <div className="dashboard-grid">
      <section className="panel activity-panel"><div className="panel-heading"><div><div className="panel-kicker">ROTINA DO SÍNDICO</div><h2>Visitas de hoje</h2><p className="panel-description">Responsável: {userName}</p></div><button className="text-button" onClick={() => onNavigate("visitas")}>Ver histórico <Icon name="chevron" size={15} /></button></div>
        {todayVisits.length ? <div className="visit-list">{todayVisits.slice(0, 4).map((visit) => <div className="visit-row" key={visit.id}><div className="visitor-avatar avatar-green"><Icon name="check" size={15} /></div><div className="visit-info"><strong>{visit.activities[0] ?? `${visit.checkedAreas.length} áreas conferidas`}</strong><span>{visit.responsible}{visit.attentionAreas.length > 0 && <><i>·</i>{visit.attentionAreas.length} pontos de atenção</>}</span></div><div className="visit-time"><span>{formatTime(visit.visitedAt)}</span><span className={`pill ${visit.attentionAreas.length ? "pill-amber" : "pill-green"}`}>{visit.attentionAreas.length ? "Acompanhar" : "Conferida"}</span></div></div>)}</div> : <EmptyState text="Registre as atividades e verificações da visita diária." action="Registrar visita" onClick={onNewVisit} />}
        <button className="inline-add" onClick={onNewVisit}><Icon name="plus" size={16} /> Registrar visita diária</button>
      </section>
      <section className="panel tasks-panel"><div className="panel-heading"><div><div className="panel-kicker">EQUIPE DE MANUTENÇÃO</div><h2>Em acompanhamento</h2></div><button className="text-button" onClick={() => onNavigate("manutencoes")}>Ver todas <Icon name="chevron" size={15} /></button></div>
        {maintenance.filter((item) => item.status !== "Concluída").length ? <div className="task-list">{maintenance.filter((item) => item.status !== "Concluída").slice(0, 4).map((item) => <div className="task-row" key={item.id}><div className={`priority-mark priority-${item.priority.toLowerCase()}`} /><div className="task-info"><strong>{item.title}</strong><span>{item.location} <i>·</i> {item.assignee}</span></div><span className={`pill ${item.status === "Em andamento" ? "pill-blue" : "pill-muted"}`}>{item.status}</span></div>)}</div> : <EmptyState text="Nenhuma manutenção em aberto." action="Criar solicitação" onClick={onNewMaintenance} />}
        <button className="inline-add" onClick={onNewMaintenance}><Icon name="plus" size={16} /> Nova solicitação</button>
      </section>
    </div>
    <div className="tip-banner"><div className="tip-spark">✳</div><div><strong>Uma pequena rotina faz uma grande diferença.</strong><span>Registre cada movimentação de material para manter o estoque sempre atualizado.</span></div><button className="tip-link" onClick={() => onNavigate("estoque")}>Acessar estoque <Icon name="arrow" size={15} /></button></div>
  </>;
}

function StatCard({ icon, label, value, note, tone, action }: { icon: string; label: string; value: string; note: string; tone: string; action: () => void }) {
  return <button className="stat-card" onClick={action}><div className="stat-top"><span className={`stat-icon ${tone}`}><Icon name={icon} size={19} /></span><span className="stat-arrow"><Icon name="arrow" size={15} /></span></div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></button>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-box"><Icon name="search" size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function PageToolbar({ query, setQuery, placeholder, onNew, buttonText }: { query: string; setQuery: (value: string) => void; placeholder: string; onNew: () => void; buttonText: string }) {
  return <div className="list-toolbar"><SearchBox value={query} onChange={setQuery} placeholder={placeholder} /><button className="button button-primary" onClick={onNew}><Icon name="plus" size={17} />{buttonText}</button></div>;
}

function PhotoGallery({ photos, scope, compact = false }: { photos: string[]; scope: string; compact?: boolean }) {
  const [images, setImages] = useState<{ id: string; name: string; url: string }[]>([]);
  const [loadedPhotoKey, setLoadedPhotoKey] = useState("");
  const scopedPhotos = useMemo(() => photos.filter((id) => id.startsWith(`${scope}:`)), [photos, scope]);
  const photoKey = scopedPhotos.join("|");
  useEffect(() => {
    let active = true;
    let objectUrls: string[] = [];
    if (!scopedPhotos.length) {
      return;
    }
    void loadPhotoUrls(scopedPhotos).then((loadedImages) => {
      objectUrls = loadedImages.map((photo) => photo.url);
      if (active) { setImages(loadedImages); setLoadedPhotoKey(photoKey); }
      else objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }).catch((error: unknown) => {
      if (active) {
        setLoadedPhotoKey(photoKey);
        window.dispatchEvent(new CustomEvent("morada-notice", { detail: error instanceof Error ? error.message : "Não foi possível carregar as fotos." }));
      }
    });
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoKey, scopedPhotos]);

  if (!photoKey) return <span className="photo-empty">Sem fotos</span>;
  if (loadedPhotoKey !== photoKey) return <span className="photo-empty">Carregando fotos...</span>;
  if (!images.length) return <span className="photo-empty">Fotos não encontradas neste dispositivo</span>;
  return <div className={`photo-gallery ${compact ? "photo-gallery-compact" : ""}`}>{images.map((image, index) => <a className="photo-thumb" href={image.url} target="_blank" rel="noreferrer" key={image.id} aria-label={`Abrir foto ${index + 1}: ${image.name}`}><Image src={image.url} alt={`Registro fotográfico ${index + 1}`} width={compact ? 54 : 116} height={compact ? 42 : 82} unoptimized /></a>)}</div>;
}

function PhotoInput() {
  return <label className="photo-input-label">Registro fotográfico<input name="photos" type="file" accept="image/*" capture="environment" multiple required /><span>Obrigatório · até 5 imagens de 8 MB cada</span></label>;
}

function VisitsPage({ visits, photoScope, query, setQuery, onNew }: { visits: DailyVisit[]; photoScope: string; query: string; setQuery: (value: string) => void; onNew: () => void }) {
  const areasInVisit = (visit: DailyVisit) => visit.checkedAreas.length ? visit.checkedAreas.join(", ") : "Sem áreas informadas";
  return <section className="panel full-panel"><div className="panel-heading"><div><div className="panel-kicker">ROTINA DO CONDOMÍNIO</div><h2>Visitas diárias</h2><p className="panel-description">Registre vistorias, tarefas realizadas e pontos que precisam de atenção.</p></div><span className="table-total">{visits.length} registros</span></div><PageToolbar query={query} setQuery={setQuery} placeholder="Buscar por atividade, área ou responsável..." onNew={onNew} buttonText="Registrar visita" />
    <div className="daily-visit-list">{visits.map((visit) => <article className="daily-visit-card" key={visit.id}><div className="daily-visit-card-top"><div className="daily-visit-date"><span className="visit-date-icon"><Icon name="calendar" size={17} /></span><div><strong>{formatLongDate(localDate(new Date(visit.visitedAt)))}</strong><span>{formatTime(visit.visitedAt)} · {visit.responsible}</span>{visit.recordedAt && <span>Registrada em {formatLongDate(localDate(new Date(visit.recordedAt)))} · {visit.registeredBy ?? "Síndico"}</span>}</div></div>{visit.attentionAreas.length > 0 && <span className="pill pill-amber">{visit.attentionAreas.length} {visit.attentionAreas.length === 1 ? "ponto de atenção" : "pontos de atenção"}</span>}</div><div className="daily-visit-areas"><strong>Áreas verificadas</strong><span>{areasInVisit(visit)}</span></div>{visit.activities.length > 0 && <div className="daily-visit-activities"><strong>O que foi feito</strong><ul>{visit.activities.map((activity, index) => <li key={`${visit.id}-${index}`}>{activity}</li>)}</ul></div>}{visit.notes && <p className="daily-visit-notes">{visit.notes}</p>}{visit.attentionAreas.length > 0 && <div className="attention-tags"><strong>Acompanhar:</strong>{visit.attentionAreas.map((area) => <span className="attention-tag" key={`${visit.id}-${area}`}>{area}</span>)}</div>}<PhotoGallery photos={visit.photos ?? emptyPhotoIds} scope={photoScope} /></article>)}{visits.length === 0 && <EmptyState text={query ? "Nenhum resultado para esta busca." : "Nenhuma visita diária registrada neste condomínio."} action="Registrar visita diária" onClick={onNew} />}</div>
  </section>;
}

function AgendaPage({ items, photoScope, selectedDate, onSelectDate, onChangeStatus, onNew }: {
  items: AppData["maintenance"]; photoScope: string; selectedDate: string; onSelectDate: (date: string) => void;
  onChangeStatus: (id: string, status: MaintenanceStatus) => void; onNew: () => void;
}) {
  const week = getWeekDates(selectedDate);
  const dayItems = items.filter((item) => localDate(new Date(item.scheduledAt)) === selectedDate)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const weekLabel = `${dateFromISO(week[0]).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${dateFromISO(week[6]).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
  const shiftWeek = (delta: number) => {
    const date = dateFromISO(selectedDate);
    date.setDate(date.getDate() + delta * 7);
    onSelectDate(localDate(date));
  };
  const nextStatus: Record<MaintenanceStatus, MaintenanceStatus> = { Aberta: "Em andamento", "Em andamento": "Concluída", Concluída: "Aberta" };

  return <section className="panel agenda-panel">
    <div className="agenda-toolbar"><div><div className="panel-kicker">PLANEJAMENTO DA EQUIPE</div><h2>Agenda de manutenções</h2><p className="panel-description">Organize os serviços por dia e acompanhe os horários de cada responsável.</p></div><div className="agenda-controls"><button className="button button-quiet agenda-today" onClick={() => onSelectDate(todayISO())}>Hoje</button><button className="icon-button agenda-arrow" aria-label="Semana anterior" onClick={() => shiftWeek(-1)}><Icon name="prev" size={17} /></button><strong className="agenda-week-label">{weekLabel}</strong><button className="icon-button agenda-arrow" aria-label="Próxima semana" onClick={() => shiftWeek(1)}><Icon name="chevron" size={17} /></button></div></div>
    <div className="week-scroll"><div className="week-grid">{week.map((date) => {
      const entries = items.filter((item) => localDate(new Date(item.scheduledAt)) === date)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      const selected = date === selectedDate;
      return <button key={date} className={`week-day ${selected ? "week-day-selected" : ""} ${date === todayISO() ? "week-day-today" : ""}`} onClick={() => onSelectDate(date)} aria-pressed={selected}>
        <span className="week-day-name">{formatWeekday(date)}</span><strong className="week-day-number">{dateFromISO(date).getDate()}</strong><span className="week-day-count">{entries.length ? `${entries.length} ${entries.length === 1 ? "serviço" : "serviços"}` : "Livre"}</span>
        <span className="week-day-events">{entries.slice(0, 2).map((item) => <span key={item.id} className={`week-event ${item.status === "Concluída" ? "week-event-done" : item.priority === "Alta" ? "week-event-high" : ""}`}><b>{formatTime(item.scheduledAt)}</b>{item.title}</span>)}{entries.length > 2 && <span className="week-more">+{entries.length - 2} mais</span>}</span>
      </button>;
    })}</div></div>
    <div className="agenda-day-heading"><div><div className="panel-kicker">SERVIÇOS AGENDADOS</div><h3>{selectedDate === todayISO() ? "Hoje" : formatWeekday(selectedDate)} · {formatLongDate(selectedDate)}</h3></div><span className="table-total">{dayItems.length} {dayItems.length === 1 ? "manutenção" : "manutenções"}</span></div>
    <div className="agenda-schedule">{dayItems.map((item) => <article className={`agenda-event-card ${item.priority === "Alta" ? "agenda-event-urgent" : ""}`} key={item.id}>
      <div className="agenda-time"><strong>{formatTime(item.scheduledAt)}</strong><span>{getEndTime(item.scheduledAt, item.durationMinutes)}</span></div><div className="agenda-event-line" />
      <div className="agenda-event-content"><div className="agenda-event-top"><div><h4>{item.title}</h4><p>{item.location} <i>·</i> {item.assignee}</p></div><span className={`pill ${item.status === "Concluída" ? "pill-green" : item.status === "Em andamento" ? "pill-blue" : "pill-muted"}`}>{item.status}</span></div>
        <div className="agenda-event-bottom"><span className={`priority-label priority-text-${item.priority.toLowerCase()}`}><i /> Prioridade {item.priority.toLowerCase()}</span><span className="agenda-duration"><Icon name="clock" size={14} />{item.durationMinutes >= 60 ? `${Math.floor(item.durationMinutes / 60)} h${item.durationMinutes % 60 ? ` ${item.durationMinutes % 60} min` : ""}` : `${item.durationMinutes} min`}</span><button className="table-action" onClick={() => onChangeStatus(item.id, nextStatus[item.status])}>{item.status === "Concluída" ? "Reabrir" : item.status === "Aberta" ? "Iniciar serviço" : "Concluir serviço"}</button></div>
        <PhotoGallery photos={item.photos ?? emptyPhotoIds} scope={photoScope} />
      </div>
    </article>)}
      {dayItems.length === 0 && <div className="agenda-empty"><div className="empty-icon"><Icon name="calendar" size={20} /></div><strong>Nenhuma manutenção neste dia</strong><span>Agende um serviço para organizar a rotina da equipe.</span><button className="button button-primary" onClick={onNew}><Icon name="plus" size={16} />Agendar manutenção</button></div>}
    </div>
  </section>;
}

function MaintenancePage({ items, photoScope, query, setQuery, onStatus, onNew }: { items: AppData["maintenance"]; photoScope: string; query: string; setQuery: (value: string) => void; onStatus: (id: string, status: MaintenanceStatus) => void; onNew: () => void }) {
  const nextStatus: Record<MaintenanceStatus, MaintenanceStatus> = { Aberta: "Em andamento", "Em andamento": "Concluída", Concluída: "Aberta" };
  return <section className="panel full-panel"><div className="panel-heading"><div><div className="panel-kicker">ROTINA E SERVIÇOS</div><h2>Solicitações de manutenção</h2><p className="panel-description">Acompanhe serviços, agenda, prioridades, fotos e responsáveis.</p></div><span className="table-total">{items.filter((item) => item.status !== "Concluída").length} em aberto</span></div><PageToolbar query={query} setQuery={setQuery} placeholder="Buscar manutenção..." onNew={onNew} buttonText="Agendar manutenção" />
    <div className="table-wrap"><table><thead><tr><th>SERVIÇO</th><th>LOCAL</th><th>RESPONSÁVEL</th><th>PRIORIDADE</th><th>AGENDADO</th><th>FOTOS</th><th>PRAZO</th><th>SITUAÇÃO</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong className="cell-primary">{item.title}</strong>{item.createdBy && <span className="cell-secondary">Registrada por {item.createdBy}</span>}</td><td>{item.location}</td><td>{item.assignee}</td><td><span className={`priority-label priority-text-${item.priority.toLowerCase()}`}><i />{item.priority}</span></td><td>{formatDate(localDate(new Date(item.scheduledAt)))} · {formatTime(item.scheduledAt)}</td><td><PhotoGallery photos={item.photos ?? emptyPhotoIds} scope={photoScope} compact /></td><td>{item.dueDate ? formatDate(item.dueDate) : "—"}</td><td><span className={`pill ${item.status === "Concluída" ? "pill-green" : item.status === "Em andamento" ? "pill-blue" : "pill-muted"}`}>{item.status}</span></td><td><button className="table-action" onClick={() => onStatus(item.id, nextStatus[item.status])}>{item.status === "Concluída" ? "Reabrir" : item.status === "Aberta" ? "Iniciar" : "Concluir"}</button></td></tr>)}</tbody></table>{items.length === 0 && <EmptyState text={query ? "Nenhum resultado para esta busca." : "Nenhuma manutenção cadastrada."} action="Agendar manutenção" onClick={onNew} />}</div>
  </section>;
}

function StockPage({ items, movements, query, setQuery, onNew, onAddItem }: { items: AppData["stock"]; movements: AppData["movements"]; query: string; setQuery: (value: string) => void; onNew: () => void; onAddItem: () => void }) {
  const low = items.filter((item) => item.quantity <= item.minimum);
  return <><div className="stock-summary"><div className="summary-box"><span>ITENS CADASTRADOS</span><strong>{items.length.toString().padStart(2, "0")}</strong><small>neste condomínio</small></div><div className={`summary-box ${low.length ? "summary-warning" : ""}`}><span>ATENÇÃO PARA REPOSIÇÃO</span><strong>{low.length.toString().padStart(2, "0")}</strong><small>{low.length ? "abaixo do mínimo" : "nenhum item pendente"}</small></div><div className="summary-box"><span>ÚLTIMAS MOVIMENTAÇÕES</span><strong>{movements.length.toString().padStart(2, "0")}</strong><small>registradas nesta demonstração</small></div></div><section className="panel full-panel"><div className="panel-heading"><div><div className="panel-kicker">MATERIAIS DO CONDOMÍNIO</div><h2>Estoque</h2><p className="panel-description">Acompanhe quantidades e níveis mínimos.</p></div><span className="table-total">{items.length} materiais</span></div><div className="list-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar material..." /><div className="toolbar-actions"><button className="button button-quiet" onClick={onAddItem}><Icon name="plus" size={16} /> Cadastrar material</button><button className="button button-primary" onClick={onNew}><Icon name="arrow" size={16} /> Movimentar</button></div></div>
    <div className="table-wrap"><table><thead><tr><th>MATERIAL</th><th>CATEGORIA</th><th>QUANTIDADE</th><th>ESTOQUE MÍNIMO</th><th>STATUS</th></tr></thead><tbody>{items.map((item) => { const isLow = item.quantity <= item.minimum; return <tr key={item.id}><td><div className="table-person"><div className={`material-icon ${item.category === "Limpeza" ? "material-clean" : "material-tools"}`}><Icon name={item.category === "Limpeza" ? "stock" : "maintenance"} size={17} /></div><strong>{item.name}</strong></div></td><td><span className={`category-tag ${item.category === "Limpeza" ? "category-clean" : "category-tools"}`}>{item.category}</span></td><td><strong className="cell-primary">{item.quantity}</strong> <span className="cell-secondary inline-unit">{item.unit}</span></td><td>{item.minimum} {item.unit}</td><td><span className={`pill ${isLow ? "pill-amber" : "pill-green"}`}>{isLow ? "Repor" : "Em dia"}</span></td></tr>; })}</tbody></table>{items.length === 0 && <EmptyState text={query ? "Nenhum resultado para esta busca." : "Nenhum material cadastrado."} action="Cadastrar material" onClick={onAddItem} />}</div>
    <div className="movement-log"><div className="panel-heading"><div><div className="panel-kicker">HISTÓRICO</div><h2>Movimentações recentes</h2></div></div>{movements.length ? movements.slice(0, 5).map((movement) => <div className="movement-row" key={movement.id}><span className={`movement-sign ${movement.type === "Entrada" ? "movement-in" : "movement-out"}`}>{movement.type === "Entrada" ? "+" : "−"}</span><div><strong>{items.find((item) => item.id === movement.itemId)?.name ?? "Material"}</strong><span>{movement.type} {movement.note ? `· ${movement.note}` : ""}</span></div><span>{movement.quantity} un.</span><time>{formatTime(movement.createdAt)}</time></div>) : <p className="no-movements">As movimentações registradas aparecerão aqui.</p>}</div>
  </section></>;
}

function ReportsPage({ visits, maintenance, stock }: { visits: DailyVisit[]; maintenance: AppData["maintenance"]; stock: AppData["stock"] }) {
  const [period, setPeriod] = useState("30");
  const start = new Date();
  if (period === "today") start.setHours(0, 0, 0, 0);
  else if (period !== "all") start.setDate(start.getDate() - Number(period));
  const filteredVisits = visits.filter((item) => period === "all" || new Date(item.visitedAt) >= start);
  const filteredMaintenance = maintenance.filter((item) => period === "all" || new Date(item.createdAt) >= start);
  const completed = filteredMaintenance.filter((item) => item.status === "Concluída").length;
  const inProgress = filteredMaintenance.filter((item) => item.status !== "Concluída").length;
  const low = stock.filter((item) => item.quantity <= item.minimum);
  const max = Math.max(filteredVisits.length, filteredMaintenance.length, stock.length, 1);
  return <><div className="report-cards"><div className="report-card"><span>VISITAS DIÁRIAS NO PERÍODO</span><strong>{filteredVisits.length}</strong><small>vistorias e atividades registradas</small><span className="report-card-icon"><Icon name="visits" /></span></div><div className="report-card"><span>MANUTENÇÕES CONCLUÍDAS</span><strong>{completed}</strong><small>{inProgress} ainda em acompanhamento</small><span className="report-card-icon report-icon-peach"><Icon name="maintenance" /></span></div><div className="report-card"><span>ITENS COM ESTOQUE BAIXO</span><strong>{low.length}</strong><small>saldo atual · necessitam reposição</small><span className="report-card-icon report-icon-sand"><Icon name="stock" /></span></div></div><div className="dashboard-grid report-grid"><section className="panel report-panel"><div className="panel-heading"><div><div className="panel-kicker">OPERAÇÃO</div><h2>Resumo do condomínio</h2></div><select className="period-chip" aria-label="Filtrar relatórios por período" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="today">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="all">Todo o período</option></select></div><div className="bar-chart">{[{ label: "Visitas realizadas", value: filteredVisits.length, color: "bar-green" }, { label: "Manutenções abertas", value: inProgress, color: "bar-peach" }, { label: "Manutenções concluídas", value: completed, color: "bar-blue" }, { label: "Materiais", value: stock.length, color: "bar-purple" }].map((item) => <div className="bar-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i className={item.color} style={{ width: `${Math.max((item.value / max) * 100, item.value ? 8 : 0)}%` }} /></div><strong>{item.value}</strong></div>)}</div></section><section className="panel report-panel"><div className="panel-heading"><div><div className="panel-kicker">ESTOQUE ATUAL</div><h2>Requer atenção</h2></div></div>{low.length ? low.map((item) => <div className="low-stock-row" key={item.id}><div className="material-icon material-tools"><Icon name="stock" size={16} /></div><div><strong>{item.name}</strong><span>{item.category}</span></div><span className="pill pill-amber">{item.quantity} / mín. {item.minimum}</span></div>) : <div className="no-movements">Todos os materiais estão acima do estoque mínimo.</div>}</section></div></>;
}

function EmptyState({ text, action, onClick }: { text: string; action?: string; onClick?: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="search" size={21} /></div><p>{text}</p>{action && onClick && <button className="text-button" onClick={onClick}>{action} <Icon name="chevron" size={15} /></button>}</div>;
}

function Modal({ type, items, defaultScheduleDate, defaultResponsible, onClose, onVisit, onMaintenance, onMovement, onStockItem, onCondo }: {
  type: "visit" | "maintenance" | "movement" | "item" | "condo"; items: AppData["stock"]; onClose: () => void;
  defaultScheduleDate: string; defaultResponsible: string;
  onVisit: (form: HTMLFormElement) => void | Promise<void>; onMaintenance: (form: HTMLFormElement) => void | Promise<void>; onMovement: (form: HTMLFormElement) => void | Promise<void>;
  onStockItem: (form: HTMLFormElement) => void; onCondo: (form: HTMLFormElement) => void | Promise<void>;
}) {
  const isVisit = type === "visit";
  const isMaintenance = type === "maintenance";
  const isMovement = type === "movement";
  const isStockItem = type === "item";
  const isCondo = type === "condo";
  const [submitting, setSubmitting] = useState(false);
  const [cep, setCep] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepResolved, setCepResolved] = useState(false);
  const [cepMessage, setCepMessage] = useState("");
  const [addressFields, setAddressFields] = useState({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
  const title = isVisit ? "Registrar visita diária" : isMaintenance ? "Agendar manutenção" : isMovement ? "Movimentar estoque" : isStockItem ? "Cadastrar material" : "Adicionar condomínio";
  const subtitle = isVisit ? "Registre a data, as atividades e as fotos da vistoria." : isMaintenance ? "Defina o horário e anexe fotos do serviço." : isMovement ? "Registre uma entrada ou saída de material." : isStockItem ? "Defina a categoria e o nível mínimo de reposição." : "Adicione outro condomínio à sua carteira.";
  const lookupCep = async () => {
    const normalizedCep = cep.replace(/\D/g, "");
    if (normalizedCep.length !== 8) {
      setCepResolved(false);
      setCepMessage("Digite um CEP com 8 números.");
      return;
    }
    setCepLoading(true);
    setCepResolved(false);
    setCepMessage("");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${normalizedCep}/json/`);
      if (!response.ok) throw new Error("Não foi possível consultar o CEP agora.");
      const result = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (result.erro || !result.localidade || !result.uf) {
        setAddressFields({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
        setCepMessage("CEP não encontrado. Confira os números e tente novamente.");
        return;
      }
      setAddressFields((current) => ({
        ...current,
        street: result.logradouro ?? "",
        neighborhood: result.bairro ?? "",
        city: result.localidade ?? "",
        state: result.uf ?? "",
      }));
      setCepResolved(true);
      setCepMessage("Endereço encontrado. Confira os dados e informe número e complemento.");
    } catch (error) {
      setAddressFields({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "" });
      setCepMessage(error instanceof Error ? error.message : "Não foi possível consultar o CEP. Tente novamente.");
    } finally {
      setCepLoading(false);
    }
  };
  const updateAddressField = (field: keyof typeof addressFields, value: string) => {
    setAddressFields((current) => ({ ...current, [field]: value }));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (isCondo && (!cepResolved || !addressFields.city || !addressFields.state)) {
      setCepMessage("Pesquise um CEP válido antes de cadastrar o condomínio.");
      return;
    }
    setSubmitting(true);
    try {
      if (isVisit) await onVisit(form);
      else if (isMaintenance) await onMaintenance(form);
      else if (isMovement) await onMovement(form);
      else if (isStockItem) onStockItem(form);
      else onCondo(form);
    } finally {
      setSubmitting(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="panel-kicker">ROTINA DO CONDOMÍNIO</span><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div><form onSubmit={submit} className="modal-form">
    {isVisit && <><div className="form-grid"><label>Data da visita<input name="visitedDate" type="date" defaultValue={todayISO()} required /></label><label>Horário<input name="visitedTime" type="time" defaultValue={currentTime()} required /></label></div><label>Responsável pela visita<input name="responsible" required autoFocus defaultValue={defaultResponsible} placeholder="Nome de quem realizou a visita" /></label><label>Atividades realizadas<textarea name="activities" rows={3} placeholder={"Uma atividade por linha\nEx.: Conferência da iluminação do bloco A"} /></label><fieldset className="checklist-field"><legend>Áreas verificadas</legend><div className="checklist-options">{visitAreas.map((area) => <label key={area}><input type="checkbox" name="checkedArea" value={area} /><span>{area}</span></label>)}</div></fieldset><fieldset className="checklist-field attention-field"><legend>Pontos que precisam de atenção</legend><div className="checklist-options">{visitAreas.map((area) => <label key={area}><input type="checkbox" name="attentionArea" value={area} /><span>{area}</span></label>)}</div></fieldset><label>Observações<textarea name="notes" rows={2} placeholder="Detalhes importantes ou próximos passos..." /></label><PhotoInput /></>}
    {isMaintenance && <><label>Descrição do serviço<input name="title" required autoFocus placeholder="Ex.: Revisar bomba da piscina" /></label><div className="form-grid"><label>Local<input name="location" required placeholder="Ex.: Área de lazer" /></label><label>Responsável<input name="assignee" placeholder="Nome da pessoa" /></label></div><div className="form-grid"><label>Prioridade<select name="priority" defaultValue="Média"><option>Baixa</option><option>Média</option><option>Alta</option></select></label><label>Prazo<input name="dueDate" type="date" defaultValue={defaultScheduleDate} required /></label></div><div className="form-grid"><label>Data agendada<input name="scheduledDate" type="date" defaultValue={defaultScheduleDate} required /></label><label>Horário<input name="scheduledTime" type="time" defaultValue="09:00" required /></label></div><label>Duração estimada<select name="durationMinutes" defaultValue="60"><option value="30">30 minutos</option><option value="60">1 hora</option><option value="90">1 hora e 30 minutos</option><option value="120">2 horas</option><option value="180">3 horas</option><option value="240">4 horas</option></select></label><PhotoInput /></>}
    {isMovement && <>{items.length ? <label>Material<select name="itemId" required defaultValue={items[0]?.id}>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · saldo {item.quantity} {item.unit}</option>)}</select></label> : <p className="form-notice">Ainda não há materiais cadastrados para este condomínio.</p>}<div className="form-grid"><label>Tipo de movimentação<select name="type" defaultValue="Entrada"><option>Entrada</option><option>Saída</option></select></label><label>Quantidade<input name="quantity" required type="number" min="1" step="1" placeholder="Ex.: 5" /></label></div><label>Observação<input name="note" placeholder="Ex.: Compra mensal, uso na limpeza..." /></label></>}
    {isStockItem && <><label>Nome do material<input name="name" required autoFocus maxLength={160} placeholder="Ex.: Desinfetante" /></label><div className="form-grid"><label>Categoria<select name="category" defaultValue="Limpeza"><option value="Limpeza">Limpeza</option><option value="Manutenção">Manutenção</option></select></label><label>Unidade<input name="unit" maxLength={16} defaultValue="un." placeholder="un., kg, L..." /></label></div><div className="form-grid"><label>Saldo inicial<input name="quantity" type="number" required min="0" step="1" defaultValue="0" /></label><label>Estoque mínimo<input name="minimum" type="number" required min="0" step="1" defaultValue="0" /></label></div></>}
    {isCondo && <>
      <label>Nome do condomínio<input name="name" required autoFocus maxLength={120} placeholder="Ex.: Residencial das Flores" /></label>
      <div className="form-grid cep-search-row">
        <label>CEP<input name="cep" inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="00000-000" value={cep} disabled={cepLoading} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 8); setCep(digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits); setCepResolved(false); setCepMessage(""); setAddressFields({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "" }); }} required /></label>
        <button type="button" className="button button-quiet cep-search-button" onClick={() => void lookupCep()} disabled={cepLoading}>{cepLoading ? "Buscando..." : "Buscar CEP"}</button>
      </div>
      {cepMessage && <p className={`cep-message ${cepResolved ? "cep-message-success" : ""}`} role="status">{cepMessage}</p>}
      <label>Rua / logradouro<input name="street" autoComplete="address-line1" value={addressFields.street} onChange={(event) => updateAddressField("street", event.target.value)} placeholder="Preenchido pela busca do CEP" /></label>
      <div className="form-grid"><label>Número<input name="number" value={addressFields.number} onChange={(event) => updateAddressField("number", event.target.value)} placeholder="Nº" /></label><label>Complemento<input name="complement" autoComplete="address-line2" value={addressFields.complement} onChange={(event) => updateAddressField("complement", event.target.value)} placeholder="Bloco, sala..." /></label></div>
      <label>Bairro<input name="neighborhood" autoComplete="address-level3" value={addressFields.neighborhood} onChange={(event) => updateAddressField("neighborhood", event.target.value)} /></label>
      <div className="form-grid"><label>Cidade<input name="city" autoComplete="address-level2" value={addressFields.city} onChange={(event) => updateAddressField("city", event.target.value)} required /></label><label>UF<input name="state" autoComplete="address-level1" maxLength={2} value={addressFields.state} onChange={(event) => updateAddressField("state", event.target.value.toUpperCase())} required /></label></div>
      <input type="hidden" name="cepLookupComplete" value={cepResolved ? "true" : "false"} />
      <p className="form-notice">Buscamos o endereço pelo serviço ViaCEP. Confira os dados antes de salvar.</p>
    </>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={submitting || (isMovement && items.length === 0)}><Icon name="check" size={17} />{submitting ? "Salvando..." : isVisit ? "Salvar visita" : isMaintenance ? "Agendar manutenção" : isMovement ? "Salvar movimentação" : isStockItem ? "Cadastrar material" : "Adicionar condomínio"}</button></div>
  </form></section></div>;
}
