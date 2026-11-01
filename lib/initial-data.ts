import type { AppData } from "./types";

const today = new Date();
const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const at = (hours: number, minutes: number) => {
  const date = new Date(today);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};
const scheduled = (dayOffset: number, hours: number, minutes: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

export const initialData: AppData = {
  condos: [
    { id: "solar", name: "Residencial Solar das Águas", address: "Rua das Palmeiras, 240 · São Paulo, SP" },
    { id: "jardins", name: "Condomínio Jardins do Vale", address: "Av. Central, 1180 · São Paulo, SP" },
    { id: "parque", name: "Edifício Parque Alto", address: "Rua do Bosque, 85 · São Paulo, SP" },
  ],
  dailyVisits: [
    { id: "dv-1", condoId: "solar", visitedAt: at(8, 24), responsible: "Alexandre Silva", activities: ["Verificação da iluminação do bloco A", "Conferência da limpeza do hall"], checkedAreas: ["Portaria", "Hall e corredores", "Iluminação"], attentionAreas: [], notes: "" },
    { id: "dv-2", condoId: "solar", visitedAt: at(10, 12), responsible: "Alexandre Silva", activities: ["Identificado vazamento próximo à piscina"], checkedAreas: ["Área de lazer", "Piscina"], attentionAreas: ["Piscina"], notes: "Solicitar avaliação da equipe de manutenção." },
  ],
  maintenance: [
    { id: "m-1", condoId: "solar", title: "Revisar bomba da piscina", location: "Área de lazer", assignee: "Carlos Lima", priority: "Alta", dueDate: todayLocal, scheduledAt: scheduled(0, 9, 0), durationMinutes: 60, status: "Em andamento", createdAt: at(7, 50) },
    { id: "m-2", condoId: "solar", title: "Trocar lâmpadas do 3º andar", location: "Bloco A · 3º andar", assignee: "Marcos Souza", priority: "Média", dueDate: todayLocal, scheduledAt: scheduled(0, 10, 30), durationMinutes: 45, status: "Aberta", createdAt: at(8, 15) },
    { id: "m-3", condoId: "solar", title: "Inspecionar portão da garagem", location: "Garagem -1", assignee: "Carlos Lima", priority: "Baixa", dueDate: todayLocal, scheduledAt: scheduled(0, 13, 30), durationMinutes: 60, status: "Concluída", createdAt: at(8, 40) },
    { id: "m-4", condoId: "solar", title: "Limpeza da caixa d'água", location: "Cobertura", assignee: "Carlos Lima", priority: "Média", dueDate: todayLocal, scheduledAt: scheduled(2, 9, 0), durationMinutes: 120, status: "Aberta", createdAt: at(8, 45) },
  ],
  stock: [
    { id: "s-1", condoId: "solar", name: "Detergente neutro", category: "Limpeza", quantity: 18, unit: "un.", minimum: 8 },
    { id: "s-2", condoId: "solar", name: "Desinfetante", category: "Limpeza", quantity: 5, unit: "un.", minimum: 8 },
    { id: "s-3", condoId: "solar", name: "Sacos de lixo 100 L", category: "Limpeza", quantity: 42, unit: "un.", minimum: 20 },
    { id: "s-4", condoId: "solar", name: "Lâmpada LED 9 W", category: "Manutenção", quantity: 6, unit: "un.", minimum: 5 },
    { id: "s-5", condoId: "solar", name: "Fita veda-rosca", category: "Manutenção", quantity: 3, unit: "un.", minimum: 5 },
  ],
  movements: [],
  dueItems: [],
};
