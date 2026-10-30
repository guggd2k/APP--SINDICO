import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, MaintenanceStatus, StockCategory, StockMovementType } from "./types";

type CondoRow = { id: string; name: string; address: string };
type VisitRow = {
  id: string; condo_id: string; visited_at: string; responsible: string; activities: string[];
  checked_areas: string[]; attention_areas: string[]; notes: string; photo_paths: string[];
  created_by: string; created_at: string;
};
type MaintenanceRow = {
  id: string; condo_id: string; title: string; location: string; assignee: string;
  priority: "low" | "medium" | "high"; status: "open" | "in_progress" | "done";
  due_date: string | null; scheduled_at: string; duration_minutes: number;
  created_by: string; created_at: string; photo_paths: string[];
};
type StockItemRow = {
  id: string; condo_id: string; name: string; category: "cleaning" | "maintenance";
  quantity: number; unit: string; minimum_quantity: number;
};
type StockMovementRow = {
  id: string; condo_id: string; item_id: string; movement_type: "in" | "out";
  quantity: number; created_at: string; note: string;
};

const maintenanceStatusFromDb: Record<MaintenanceRow["status"], MaintenanceStatus> = {
  open: "Aberta", in_progress: "Em andamento", done: "Concluída",
};
const maintenanceStatusToDb: Record<MaintenanceStatus, MaintenanceRow["status"]> = {
  Aberta: "open", "Em andamento": "in_progress", Concluída: "done",
};
const categoryFromDb: Record<StockItemRow["category"], StockCategory> = { cleaning: "Limpeza", maintenance: "Manutenção" };
const categoryToDb: Record<StockCategory, StockItemRow["category"]> = { Limpeza: "cleaning", Manutenção: "maintenance" };
const movementFromDb: Record<StockMovementRow["movement_type"], StockMovementType> = { in: "Entrada", out: "Saída" };
const movementToDb: Record<StockMovementType, StockMovementRow["movement_type"]> = { Entrada: "in", Saída: "out" };
const priorityToDb = { Baixa: "low", Média: "medium", Alta: "high" } as const;

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadCloudData(client: SupabaseClient, userId: string, userName: string): Promise<AppData> {
  const [condosResult, visitsResult, maintenanceResult, stockResult, movementsResult] = await Promise.all([
    client.from("condos").select("id,name,address").order("name"),
    client.from("daily_visits").select("*").order("visited_at", { ascending: false }),
    client.from("maintenance_requests").select("*").order("scheduled_at"),
    client.from("stock_items").select("*").order("name"),
    client.from("stock_movements").select("*").order("created_at", { ascending: false }),
  ]);
  throwOnError(condosResult.error);
  throwOnError(visitsResult.error);
  throwOnError(maintenanceResult.error);
  throwOnError(stockResult.error);
  throwOnError(movementsResult.error);

  const condos = (condosResult.data ?? []) as CondoRow[];
  const visits = (visitsResult.data ?? []) as VisitRow[];
  const maintenance = (maintenanceResult.data ?? []) as MaintenanceRow[];
  const stock = (stockResult.data ?? []) as StockItemRow[];
  const movements = (movementsResult.data ?? []) as StockMovementRow[];

  return {
    condos,
    dailyVisits: visits.map((visit) => ({
      id: visit.id, condoId: visit.condo_id, visitedAt: visit.visited_at, responsible: visit.responsible,
      activities: visit.activities ?? [], checkedAreas: visit.checked_areas ?? [], attentionAreas: visit.attention_areas ?? [],
      notes: visit.notes, photos: (visit.photo_paths ?? []).map((path) => `${userId}:cloud:${path}`),
      registeredBy: visit.created_by === userId ? userName : "Síndico",
      createdById: visit.created_by,
      recordedAt: visit.created_at,
    })),
    maintenance: maintenance.map((item) => ({
      id: item.id, condoId: item.condo_id, title: item.title, location: item.location, assignee: item.assignee,
      priority: item.priority === "high" ? "Alta" : item.priority === "low" ? "Baixa" : "Média",
      status: maintenanceStatusFromDb[item.status], dueDate: item.due_date ?? "", scheduledAt: item.scheduled_at,
      durationMinutes: item.duration_minutes, createdAt: item.created_at,
      photos: (item.photo_paths ?? []).map((path) => `${userId}:cloud:${path}`),
      createdBy: item.created_by === userId ? userName : "Equipe do condomínio",
      createdById: item.created_by,
    })),
    stock: stock.map((item) => ({
      id: item.id, condoId: item.condo_id, name: item.name, category: categoryFromDb[item.category],
      quantity: item.quantity, unit: item.unit, minimum: item.minimum_quantity,
    })),
    movements: movements.map((movement) => ({
      id: movement.id, condoId: movement.condo_id, itemId: movement.item_id,
      type: movementFromDb[movement.movement_type], quantity: movement.quantity,
      createdAt: movement.created_at, note: movement.note,
    })),
  };
}

export async function syncCloudData(client: SupabaseClient, data: AppData, userId: string) {
  if (data.dailyVisits.length) {
    const { error } = await client.from("daily_visits").upsert(data.dailyVisits.map((visit) => ({
      id: visit.id, condo_id: visit.condoId, visited_at: visit.visitedAt, responsible: visit.responsible,
      activities: visit.activities, checked_areas: visit.checkedAreas, attention_areas: visit.attentionAreas,
      notes: visit.notes, photo_paths: (visit.photos ?? []).filter((photo) => photo.startsWith(`${userId}:cloud:`)).map((photo) => photo.slice(`${userId}:cloud:`.length)),
      created_by: visit.createdById ?? userId, ...(visit.recordedAt ? { created_at: visit.recordedAt } : {}),
    })), { onConflict: "id" });
    throwOnError(error);
  }

  if (data.maintenance.length) {
    const { error } = await client.from("maintenance_requests").upsert(data.maintenance.map((item) => ({
      id: item.id, condo_id: item.condoId, title: item.title, location: item.location, assignee: item.assignee,
      priority: priorityToDb[item.priority], status: maintenanceStatusToDb[item.status], due_date: item.dueDate || null,
      scheduled_at: item.scheduledAt, duration_minutes: item.durationMinutes,
      photo_paths: (item.photos ?? []).filter((photo) => photo.startsWith(`${userId}:cloud:`)).map((photo) => photo.slice(`${userId}:cloud:`.length)),
      created_by: item.createdById ?? userId, created_at: item.createdAt,
    })), { onConflict: "id" });
    throwOnError(error);
  }

  if (data.stock.length) {
    const { error } = await client.from("stock_items").upsert(data.stock.map((item) => ({
      id: item.id, condo_id: item.condoId, name: item.name, category: categoryToDb[item.category],
      unit: item.unit, minimum_quantity: item.minimum,
    })), { onConflict: "id", ignoreDuplicates: true });
    throwOnError(error);
  }

  if (data.movements.length) {
    const { error } = await client.from("stock_movements").upsert(data.movements.map((movement) => ({
      id: movement.id, condo_id: movement.condoId, item_id: movement.itemId,
      movement_type: movementToDb[movement.type], quantity: movement.quantity,
      note: movement.note, created_by: userId, created_at: movement.createdAt,
    })), { onConflict: "id", ignoreDuplicates: true });
    throwOnError(error);
  }
}

let syncQueue = Promise.resolve();

export function queueCloudSync(client: SupabaseClient, data: AppData, userId: string) {
  const pending = syncQueue.catch(() => undefined).then(() => syncCloudData(client, data, userId));
  syncQueue = pending;
  return pending;
}
