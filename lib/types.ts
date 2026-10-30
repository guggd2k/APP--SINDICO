export type Section = "inicio" | "visitas" | "agenda" | "manutencoes" | "estoque" | "relatorios";
export type MaintenanceStatus = "Aberta" | "Em andamento" | "Concluída";
export type StockCategory = "Limpeza" | "Manutenção";
export type StockMovementType = "Entrada" | "Saída";
export type DailyVisit = {
  id: string;
  condoId: string;
  visitedAt: string;
  responsible: string;
  activities: string[];
  checkedAreas: string[];
  attentionAreas: string[];
  notes: string;
  photos?: string[];
  registeredBy?: string;
  createdById?: string;
  recordedAt?: string;
};

export type AccessVisit = {
  id: string;
  condoId: string;
  visitor: string;
  unit: string;
  host: string;
  purpose: string;
  entryAt: string;
  exitAt?: string;
  status: "Dentro" | "Encerrada";
};

export interface Condo {
  id: string;
  name: string;
  address: string;
}

export interface Maintenance {
  id: string;
  condoId: string;
  title: string;
  location: string;
  assignee: string;
  priority: "Baixa" | "Média" | "Alta";
  dueDate: string;
  scheduledAt: string;
  durationMinutes: number;
  status: MaintenanceStatus;
  createdAt: string;
  photos?: string[];
  createdBy?: string;
  createdById?: string;
}

export interface StockItem {
  id: string;
  condoId: string;
  name: string;
  category: StockCategory;
  quantity: number;
  unit: string;
  minimum: number;
}

export interface StockMovement {
  id: string;
  condoId: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  createdAt: string;
  note: string;
}

export interface AppData {
  condos: Condo[];
  dailyVisits: DailyVisit[];
  accessHistory?: AccessVisit[];
  maintenance: Maintenance[];
  stock: StockItem[];
  movements: StockMovement[];
}
