import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Smartphone,
  Banknote,
  Percent,
  Scale,
  TrendingUp,
  Upload,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileSearch,
  Download,
  Database,
  Home,
  Landmark,
  LockKeyhole,
  LogOut,
  Menu,
  Pencil,
  KeyRound,
  Eye,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Store,
  UserCog,
  UserRound,
  Users,
  WalletCards,
  X
} from "lucide-react";

type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  role: { code: string; name: string };
  permissions: string[];
  branch: { id: number; code: string; name: string; address: string | null } | null;
  defaultBranch: { id: number; code: string; name: string; address: string | null } | null;
  lastLoginAt: string | null;
};

type AdminPage =
  | "dashboard"
  | "branches"
  | "operations"
  | "cash"
  | "users"
  | "commissions"
  | "reports"
  | "audit"
  | "backup"
  | "integrations"
  | "settings"
  | "security"
  | "profile";

type Branch = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  active: boolean;
  operationsToday: number;
  commissionToday: number;
  cashOpen: boolean;
  cashStartedAt: string | null;
  settings: {
    maxOperationAmount: number;
    commissionType: "FLAT" | "PERCENT";
    commissionValue: number;
    staffSharePct: number | null;
    partnerSharePct: number | null;
  };
};

type GlobalOperation = {
  id: number;
  operation_type: "YAPE_TO_CASH" | "CASH_TO_YAPE";
  reference_code: string | null;
  customer_name: string | null;
  amount: number;
  commission: number;
  staff_share_amount?: number;
  partner_share_amount?: number;
  net_amount: number;
  status: string;
  created_at: string;
  branch_id: number;
  branch_name: string;
  registered_by: string | null;
  receipt_series?: string | null;
  receipt_number?: number | null;
};

type Overview = {
  metrics: {
    activeBranches: number;
    activeUsers: number;
    openCashSessions: number;
    operationsToday: number;
    yapeReceived: number;
    cashDelivered: number;
    commissionToday: number;
  };
  branches: Branch[];
  recentOperations: GlobalOperation[];
};

type DashboardData = {
  date: string;
  branchId: number | null;
  updatedAt: string;
  metrics: {
    operations: number;
    yapeReceived: number;
    cashDelivered: number;
    commissionTotal: number;
    staffShareTotal: number;
    partnerShareTotal: number;
    cashExpected: number;
    cashDifference: number;
  };
  comparison: {
    operations: number;
    yapeReceived: number;
    cashDelivered: number;
    commissionTotal: number;
    staffShareTotal: number;
    partnerShareTotal: number;
  };
  hours: Array<{ hour: number; label: string; operations: number }>;
  branches: Array<{
    id: number;
    code: string;
    name: string;
    operations: number;
    yapeReceived: number;
    cashDelivered: number;
    amountTotal: number;
    commissionTotal: number;
  }>;
  recentOperations: GlobalOperation[];
  differenceWallet: number;
};

type AdminUser = {
  id: number;
  username: string;
  full_name: string;
  active: number;
  created_at: string;
  last_login_at: string | null;
  role_code: string;
  role_name: string;
  branch_id: number | null;
  branch_name: string | null;
};

type UserDetail = {
  user: AdminUser;
  metrics: {
    operationsToday: number;
    operationsTotal: number;
    earningsToday: number;
    earningsTotal: number;
    cancelledTotal: number;
  };
  openCash: {
    id: number;
    status: string;
    initial_cash: number;
    initial_wallet: number;
    started_at: string;
  } | null;
  recentOperations: Array<{
    id: number;
    operation_type: "YAPE_TO_CASH" | "CASH_TO_YAPE";
    reference_code: string | null;
    amount: number;
    commission: number;
    net_amount: number;
    status: string;
    created_at: string;
  }>;
};

type Closure = {
  id: number;
  operation_count?: number;
  commission_total?: number;
  staff_share_total?: number;
  partner_share_total?: number;
  expected_cash: number;
  declared_cash: number;
  expected_wallet: number;
  declared_wallet: number;
  difference_cash: number;
  difference_wallet: number;
  notes: string | null;
  closed_at: string;
  closed_by?: string | null;
  branch_id: number;
  branch_name: string;
  electronic_boleta_series?: string | null;
  electronic_boleta_number?: number | string | null;
  electronic_boleta_status?: "PENDING" | "ACCEPTED" | "REJECTED" | "UNKNOWN" | null;
};

type ClosureOperation = {
  id: number;
  operation_type: "YAPE_TO_CASH" | "CASH_TO_YAPE";
  reference_code: string | null;
  customer_name: string | null;
  amount: number;
  commission: number;
  net_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  registered_by: string | null;
  receipt_series: string | null;
  receipt_number: number | null;
  latest_event_action: string | null;
  latest_event_reason: string | null;
  latest_event_at: string | null;
};

type ClosureDetail = {
  closure: Closure & { cash_session_id: number };
  operations: ClosureOperation[];
};

type AuditRow = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: unknown;
  created_at: string;
  branch_name: string | null;
  user_name: string | null;
  username: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

type SystemSettings = {
  businessName: string;
  legalName: string | null;
  ruc: string | null;
  address: string | null;
  phone: string | null;
  logoDataUrl: string | null;
  currencyCode: string;
  timezoneName: string;
  ticketFooter: string | null;
  receiptPrefix: string;
  defaultMaxOperationAmount: number;
  defaultCommissionType: "FLAT" | "PERCENT";
  defaultCommissionValue: number;
  requireCashToYapeReference: boolean;
  allowCashierCancel: boolean;
  updatedAt: string;
};

type SecuritySession = {
  id: number;
  userId: number;
  username: string;
  fullName: string;
  roleName: string;
  branchName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  current: boolean;
};

type SystemStatus = {
  ok: boolean;
  api: { uptimeSeconds: number; node: string; memoryMb: number };
  database: { ok: boolean; version: string; time: string };
  counts: {
    activeBranches: number;
    activeUsers: number;
    activeSessions: number;
    openCashSessions: number;
    operationsToday: number;
  };
};


type RolePermissionInfo = {
  id: number;
  code: string;
  name: string;
  permissions: string[];
};

type FinancialReport = {
  filters: { branchId: number | null; from: string | null; to: string | null };
  summary: {
    operationCount: number;
    amountTotal: number;
    commissionTotal: number;
    staffShareTotal: number;
    partnerShareTotal: number;
    unassignedCommission: number;
    yapeToCashCount: number;
    cashToYapeCount: number;
  };
  branches: Array<{
    id: number;
    code: string;
    name: string;
    operationCount: number;
    amountTotal: number;
    commissionTotal: number;
    staffShareTotal: number;
    partnerShareTotal: number;
  }>;
  branchComparison: Array<{
    id: number;
    code: string;
    name: string;
    operationCount: number;
    amountTotal: number;
    commissionTotal: number;
    staffShareTotal: number;
    partnerShareTotal: number;
  }>;
  operations: Array<GlobalOperation & { series?: string | null; sequence_number?: number | null }>;
};

type BranchDetail = {
  branch: {
    id: number;
    code: string;
    name: string;
    address: string | null;
    active: boolean;
    createdAt: string;
    settings: Branch["settings"];
  };
  today: { operations: number; amount: number; commission: number };
  users: Array<{
    id: number;
    username: string;
    full_name: string;
    active: number;
    last_login_at: string | null;
    role_code: string;
    role_name: string;
  }>;
  cashSessions: Array<{
    id: number;
    initial_cash: number;
    initial_wallet: number;
    declared_cash: number | null;
    declared_wallet: number | null;
    status: "OPEN" | "CLOSED";
    started_at: string;
    ended_at: string | null;
  }>;
  recentOperations: Array<{
    id: number;
    operation_type: "YAPE_TO_CASH" | "CASH_TO_YAPE";
    reference_code: string | null;
    customer_name: string | null;
    amount: number;
    commission: number;
    staff_share_amount?: number;
    partner_share_amount?: number;
    net_amount: number;
    status: string;
    created_at: string;
    registered_by: string | null;
    receipt_series?: string | null;
    receipt_number?: number | null;
  }>;
  closures: Array<{
    id: number;
    operation_count?: number;
    commission_total?: number;
    staff_share_total?: number;
    partner_share_total?: number;
    expected_cash: number;
    declared_cash: number;
    expected_wallet: number;
    declared_wallet: number;
    difference_cash: number;
    difference_wallet: number;
    notes: string | null;
    closed_at: string;
    closed_by?: string | null;
  }>;
};

const nav: Array<{ page: AdminPage; label: string; icon: typeof Home }> = [
  { page: "dashboard", label: "Inicio", icon: Home },
  { page: "branches", label: "Filiales", icon: Building2 },
  { page: "operations", label: "Operaciones", icon: ReceiptText },
  { page: "cash", label: "Cajas / Cierres", icon: WalletCards },
  { page: "users", label: "Usuarios", icon: Users },
  { page: "commissions", label: "Comisiones", icon: CircleDollarSign },
  { page: "reports", label: "Reportes", icon: BarChart3 },
  { page: "audit", label: "Auditoría", icon: FileSearch },
  { page: "backup", label: "Backup", icon: Database },
  { page: "integrations", label: "Integraciones", icon: KeyRound },
  { page: "settings", label: "Configuración", icon: Settings2 },
  { page: "security", label: "Seguridad", icon: ShieldCheck },
  { page: "profile", label: "Mi perfil", icon: UserRound }
];

const UI_BUILD = "E4.5-20261008";

function currency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2
  }).format(Number(value ?? 0));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function closureResult(item: Pick<Closure, "difference_cash" | "difference_wallet">) {
  const cash = Number(item.difference_cash ?? 0);
  const wallet = Number(item.difference_wallet ?? 0);
  if (Math.abs(cash) < 0.005 && Math.abs(wallet) < 0.005) return { label: "Cuadra", cls: "open" };
  if (cash < 0 || wallet < 0) {
    if (cash > 0 || wallet > 0) return { label: "Diferencias mixtas", cls: "warning" };
    return { label: "Faltante", cls: "danger" };
  }
  return { label: "Sobrante", cls: "warning" };
}


function pendingCommission(item: Pick<Closure, "commission_total" | "staff_share_total" | "partner_share_total">) {
  return Math.max(
    0,
    Number(item.commission_total ?? 0)
      - Number(item.staff_share_total ?? 0)
      - Number(item.partner_share_total ?? 0)
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "No se pudo completar la solicitud");
  return result as T;
}

export default function OwnerApp({ user, onLogout, businessName }: { user: AuthUser; onLogout: () => Promise<void> | void; businessName: string }) {
  const [page, setPage] = useState<AdminPage>("dashboard");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [operations, setOperations] = useState<GlobalOperation[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [branchModal, setBranchModal] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [settingsBranch, setSettingsBranch] = useState<Branch | null>(null);
  const [detailBranchId, setDetailBranchId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);

  const initials = user.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  async function loadOverview() {
    const data = await api<Overview>("/api/admin/overview");
    setOverview(data);
  }

  async function loadUsers() {
    const data = await api<{ users: AdminUser[] }>("/api/admin/users");
    setUsers(data.users ?? []);
  }

  async function loadOperations() {
    const data = await api<{ operations: GlobalOperation[] }>("/api/admin/operations");
    setOperations(data.operations ?? []);
  }

  async function loadClosures() {
    const data = await api<{ closures: Closure[] }>("/api/admin/closures");
    setClosures(data.closures ?? []);
  }

  async function loadAudit() {
    const data = await api<{ audit: AuditRow[] }>("/api/admin/audit");
    setAuditRows(data.audit ?? []);
  }

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadOverview(), loadUsers(), loadOperations(), loadClosures(), loadAudit()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el panel");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  const pageTitle: Record<AdminPage, [string, string]> = {
    dashboard: ["Panel del propietario", "Vista general de todas las filiales y operaciones"],
    branches: ["Filiales", "Crea, consulta y administra cada punto de operación"],
    operations: ["Operaciones globales", "Movimientos registrados en todas las filiales"],
    cash: ["Cajas y cierres", "Estado operativo y conciliaciones de todas las filiales"],
    users: ["Usuarios y roles", "Control de accesos y asignación de personal"],
    commissions: ["Comisiones", "Reglas de cobro por filial"],
    reports: ["Reportes", "Consolidado operativo y financiero"],
    audit: ["Auditoría", "Historial de acciones sensibles del sistema"],
    backup: ["Backup", "Crea, descarga y restaura copias de la base de datos"],
    integrations: ["Integraciones", "Conecta servicios externos como Factiliza"],
    settings: ["Configuración general", "Datos del negocio y reglas centrales del sistema local"],
    security: ["Seguridad y sesiones", "Control de sesiones activas y estado del entorno local"],
    profile: ["Mi perfil", "Cuenta propietaria y seguridad"]
  };

  function go(next: AdminPage) {
    setPage(next);
    setMobileNav(false);
  }

  return (
    <div className="app-shell owner-shell">
      <aside className={`sidebar owner-sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><BadgeDollarSign size={22} /></div>
          <div><strong>{businessName}</strong><span>Panel propietario</span></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}><X size={20} /></button>
        </div>

        <div className="owner-badge"><ShieldCheck size={16} /><div><strong>Acceso global</strong><span>Propietario</span></div></div>

        <nav>
          {nav.map(({ page: itemPage, label, icon: Icon }) => (
            <button
              className={`nav-item ${page === itemPage ? "active" : ""}`}
              key={itemPage}
              onClick={() => go(itemPage)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="owner-context">
            <Store size={18} />
            <div><strong>Todas las filiales</strong><span>Vista consolidada</span></div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" title="Actualizar" onClick={() => void refreshAll()}><RefreshCw size={18} /></button>
            <button className="icon-btn" title="Notificaciones"><Bell size={18} /></button>
            <button className="user-chip user-button" onClick={() => go("profile")}>
              <div className="avatar">{initials || "AD"}</div>
              <div><strong>{user.fullName}</strong><span>{user.role.name}</span></div>
            </button>
            <button className="icon-btn" title="Cerrar sesión" onClick={() => void onLogout()}><LogOut size={18} /></button>
          </div>
        </header>

        <section className="content owner-content">
          {page !== "dashboard" && <div className="page-title-row">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
            <div>
              <div className="title-line">
                <h1>{pageTitle[page][0]}</h1>
                <span className="owner-access"><ShieldCheck size={13} /> Acceso propietario</span>
              </div>
              <p>{pageTitle[page][1]}</p>
            </div>
            <div className="page-actions">
              {page === "branches" && <button className="primary" onClick={() => setBranchModal(true)}><Plus size={17} /> Nueva filial</button>}
              {page === "users" && <button className="primary" onClick={() => setUserModal(true)}><Plus size={17} /> Nuevo usuario</button>}
            </div>
          </div>}

          {error && <div className="error-banner">{error}<button onClick={() => void refreshAll()}><RefreshCw size={14} /> Reintentar</button></div>}
          {loading && !overview ? <div className="owner-loading">Cargando información global…</div> : null}

          {page === "dashboard" && overview && <OwnerDashboard user={user} overview={overview} onPage={go} />}
          {page === "branches" && overview && <BranchesPage branches={overview.branches} onSettings={setSettingsBranch} onDetail={(branch) => setDetailBranchId(branch.id)} />}
          {page === "operations" && <GlobalOperationsPage operations={operations} branches={overview?.branches ?? []} onRefresh={refreshAll} />}
          {page === "cash" && <CashAdminPage branches={overview?.branches ?? []} closures={closures} />}
          {page === "users" && <UsersPage users={users} branches={overview?.branches ?? []} onDetail={setDetailUserId} />}
          {page === "commissions" && overview && <CommissionsPage branches={overview.branches} onSettings={setSettingsBranch} />}
          {page === "reports" && overview && <AdminReports overview={overview} operations={operations} closures={closures} />}
          {page === "audit" && <AuditPage rows={auditRows} />}
          {page === "backup" && <BackupPage />}
          {page === "integrations" && <IntegrationsPage />}
          {page === "settings" && <SystemSettingsPage />}
          {page === "security" && <SecurityPage currentUserId={user.id} />}
          {page === "profile" && <OwnerProfile user={user} />}
        </section>
      </main>

      {branchModal && <CreateBranchModal onClose={() => setBranchModal(false)} onCreated={async () => { setBranchModal(false); await refreshAll(); }} />}
      {userModal && <CreateUserModal branches={overview?.branches ?? []} users={users} onClose={() => setUserModal(false)} onCreated={async () => { setUserModal(false); await refreshAll(); }} />}
      {settingsBranch && <BranchSettingsModal branch={settingsBranch} onClose={() => setSettingsBranch(null)} onSaved={async () => { setSettingsBranch(null); await refreshAll(); }} />}
      {detailBranchId && <BranchDetailModal branchId={detailBranchId} onClose={() => setDetailBranchId(null)} onChanged={refreshAll} />}
      {detailUserId && <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} onEdit={(target) => { setDetailUserId(null); setEditingUser(target); }} />}
      {editingUser && <EditUserModal user={editingUser} branches={overview?.branches ?? []} users={users} currentUserId={user.id} onClose={() => setEditingUser(null)} onSaved={async () => { setEditingUser(null); await refreshAll(); }} />}
    </div>
  );
}

function OwnerDashboard({ user, overview, onPage }: { user: AuthUser; overview: Overview; onPage: (page: AdminPage) => void }) {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [selectedBranch, setSelectedBranch] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(today);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function query() {
    const p = new URLSearchParams({ date: selectedDate });
    if (selectedBranch !== "ALL") p.set("branchId", selectedBranch);
    return p.toString();
  }

  async function loadDashboard() {
    setLoading(true); setError("");
    try {
      setData(await api<DashboardData>(`/api/admin/dashboard?${query()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el panel principal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, [selectedBranch, selectedDate]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const firstName = user.fullName.split(/\s+/)[0] || "Administrador";
  const maxHour = Math.max(...(data?.hours.map((item) => item.operations) ?? [1]), 1);
  const maxBranch = Math.max(...(data?.branches.map((item) => item.yapeReceived + item.cashDelivered) ?? [1]), 1);
  const rankMax = Math.max(...(data?.branches.map((item) => item.amountTotal) ?? [1]), 1);
  const displayDate = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="graphic-dashboard">
      <div className="dashboard-top-controls">
        <label className="dashboard-selector"><Building2 size={16}/><select value={selectedBranch} onChange={(e)=>setSelectedBranch(e.target.value)}><option value="ALL">Todas las filiales</option>{overview.branches.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="dashboard-selector date"><CalendarDays size={16}/><input type="date" value={selectedDate} onChange={(e)=>setSelectedDate(e.target.value)} /></label>
      </div>

      <div className="dashboard-welcome">
        <div><h1>¡{greeting}, {firstName}!</h1><p>Aquí tienes el resumen de tus operaciones {selectedBranch === "ALL" ? "en todas las filiales" : "en la filial seleccionada"}.</p></div>
        <div className="dashboard-live">
          <span><i/> Sistema en línea</span>
          <small>Última actualización: {data ? new Date(data.updatedAt).toLocaleString("es-PE", { hour:"2-digit", minute:"2-digit", day:"2-digit", month:"2-digit", year:"numeric" }) : "—"}</small>
          <button className="icon-btn" onClick={() => void loadDashboard()} title="Actualizar"><RefreshCw size={17}/></button>
        </div>
      </div>

      {error && <div className="error-banner">{error}<button onClick={() => void loadDashboard()}><RefreshCw size={14}/> Reintentar</button></div>}
      {loading && !data && <div className="owner-loading">Actualizando panel principal…</div>}

      {data && <>
        <div className="dashboard-kpi-grid">
          <GraphicKpi icon={<Activity/>} tone="blue" label="Operaciones" value={String(data.metrics.operations)} trend={data.comparison.operations} />
          <GraphicKpi icon={<Smartphone/>} tone="purple" label="Yape recibido" value={currency(data.metrics.yapeReceived)} trend={data.comparison.yapeReceived} />
          <GraphicKpi icon={<Banknote/>} tone="green" label="Efectivo entregado" value={currency(data.metrics.cashDelivered)} trend={data.comparison.cashDelivered} />
          <GraphicKpi icon={<Percent/>} tone="orange" label="Comisión generada" value={currency(data.metrics.commissionTotal)} trend={data.comparison.commissionTotal} />
          <GraphicKpi icon={<WalletCards/>} tone="blue" label="Caja esperada" value={currency(data.metrics.cashExpected)} subtitle="Según cajas abiertas" />
          <GraphicKpi icon={<Scale/>} tone={Math.abs(data.metrics.cashDifference) < 0.005 ? "green" : "red"} label="Diferencia de caja" value={currency(data.metrics.cashDifference)} subtitle={Math.abs(data.metrics.cashDifference) < 0.005 ? "✓ Cuadra" : "Revisar diferencia"} />
        </div>

        <div className="dashboard-visual-grid">
          <section className="card dashboard-chart-card">
            <div className="dashboard-card-head"><div><BarChart3 size={17}/><strong>Operaciones por hora</strong></div><span>{displayDate}</span></div>
            <div className="hour-chart">
              {data.hours.map((item) => <div className="hour-column" key={item.hour}>
                <div className="hour-bar-track"><div className="hour-bar" style={{height:`${Math.max(item.operations ? 10 : 2,(item.operations/maxHour)*100)}%`}}><span>{item.operations || ""}</span></div></div>
                <small>{item.label}</small>
              </div>)}
            </div>
          </section>

          <section className="card dashboard-chart-card branch-chart-card">
            <div className="dashboard-card-head"><div><Activity size={17}/><strong>Operaciones por filial</strong></div><span>{displayDate}</span></div>
            <div className="chart-legend"><span><i className="legend-blue"/>Yape recibido</span><span><i className="legend-green"/>Efectivo entregado</span></div>
            <div className="branch-bar-chart">
              {data.branches.map((item) => {
                const total = item.yapeReceived + item.cashDelivered;
                const height = Math.max(total ? 12 : 2,(total/maxBranch)*100);
                const yapePct = total ? (item.yapeReceived/total)*100 : 50;
                return <div className="branch-bar-column" key={item.id}>
                  <strong>{currency(item.amountTotal)}</strong>
                  <div className="stack-track" style={{height:`${height}%`}}><i className="stack-yape" style={{height:`${yapePct}%`}}/><i className="stack-cash" style={{height:`${100-yapePct}%`}}/></div>
                  <small>{item.name}</small>
                </div>;
              })}
              {!data.branches.length && <div className="empty-cell">Sin datos para este día.</div>}
            </div>
          </section>

          <section className="card dashboard-day-summary">
            <div className="dashboard-card-head"><div><CalendarDays size={17}/><strong>Resumen del día</strong></div></div>
            <div className="day-summary-list">
              <DashboardSummary icon={<ReceiptText/>} label="Total operaciones" value={String(data.metrics.operations)} />
              <DashboardSummary icon={<Smartphone/>} label="Yape recibido" value={currency(data.metrics.yapeReceived)} />
              <DashboardSummary icon={<Banknote/>} label="Efectivo entregado" value={currency(data.metrics.cashDelivered)} />
              <DashboardSummary icon={<Percent/>} label="Comisión generada" value={currency(data.metrics.commissionTotal)} />
              <DashboardSummary icon={<WalletCards/>} label="Caja esperada" value={currency(data.metrics.cashExpected)} />
              <DashboardSummary icon={<Scale/>} label="Diferencia de caja" value={currency(data.metrics.cashDifference)} />
            </div>
            <div className={Math.abs(data.metrics.cashDifference)<0.005 ? "cash-ok-box" : "cash-alert-box"}><CheckCircle2 size={20}/><div><strong>{Math.abs(data.metrics.cashDifference)<0.005 ? "La caja cuadra correctamente." : "Hay una diferencia por revisar."}</strong><span>{Math.abs(data.metrics.cashDifference)<0.005 ? "No se registran diferencias de efectivo." : `Diferencia: ${currency(data.metrics.cashDifference)}`}</span></div></div>
          </section>
        </div>

        <div className="dashboard-bottom-grid">
          <section className="card dashboard-recent">
            <div className="dashboard-card-head"><div><ReceiptText size={17}/><strong>Operaciones recientes</strong></div><button className="ghost" onClick={()=>onPage("operations")}>Ver todas <ChevronRight size={13}/></button></div>
            <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Fecha / Hora</th><th>Filial</th><th>Tipo</th><th>Código / Referencia</th><th>Monto</th><th>Comisión</th><th>Entregado</th><th>Estado</th></tr></thead><tbody>
              {data.recentOperations.map((op)=><tr key={op.id}><td>{dateTime(op.created_at)}</td><td>{op.branch_name}</td><td><span className={`type-pill ${op.operation_type==="YAPE_TO_CASH"?"yape":"cash"}`}>{op.operation_type==="YAPE_TO_CASH"?"Yape":"Efectivo"}</span></td><td>{op.reference_code??"—"}</td><td>{currency(op.amount)}</td><td>{currency(op.commission)}</td><td>{currency(op.net_amount)}</td><td><span className={`status ${op.status==="COMPLETED"?"ok":"pending"}`}><i/>{op.status==="COMPLETED"?"Completada":"En proceso"}</span></td></tr>)}
              {!data.recentOperations.length && <tr><td colSpan={8} className="empty-cell">No hay operaciones en la fecha seleccionada.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="card dashboard-ranking">
            <div className="dashboard-card-head"><div><Building2 size={17}/><strong>Filiales ({displayDate})</strong></div><button className="ghost" onClick={()=>onPage("branches")}>Ver detalle <ChevronRight size={13}/></button></div>
            <div className="ranking-list">
              {data.branches.map((item,index)=><div className="ranking-row" key={item.id}><b>{index+1}</b><div><div><strong>{item.name}</strong><span>{item.operations} ops</span><em>{currency(item.amountTotal)}</em></div><div className="ranking-track"><i style={{width:`${Math.max(4,(item.amountTotal/rankMax)*100)}%`}}/></div></div></div>)}
              {!data.branches.length && <div className="empty-cell">Sin actividad.</div>}
            </div>
          </section>
        </div>
      </>}
    </div>
  );
}

function GraphicKpi({ icon, tone, label, value, trend, subtitle }: { icon: React.ReactNode; tone: string; label: string; value: string; trend?: number; subtitle?: string }) {
  return <section className="card graphic-kpi"><div className={`graphic-kpi-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong>{trend !== undefined ? <small className={trend>=0?"trend-up":"trend-down"}><TrendingUp size={11}/> {trend>=0?"+":""}{trend}% <em>vs. día anterior</em></small> : <small className="kpi-subtitle">{subtitle}</small>}</div></section>;
}

function DashboardSummary({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) {
  return <div className="dashboard-summary-row"><span>{icon}</span><label>{label}</label><strong>{value}</strong></div>;
}


function OwnerKpi({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <section className="card owner-kpi">
      <div className={`kpi-icon ${tone}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function BranchesPage({ branches, onSettings, onDetail }: { branches: Branch[]; onSettings: (branch: Branch) => void; onDetail: (branch: Branch) => void }) {
  return (
    <div className="branch-cards-grid">
      {branches.map((branch) => (
        <section className="card branch-admin-card" key={branch.id}>
          <div className="branch-admin-head">
            <div className="branch-monogram big">{branch.code.slice(0, 2)}</div>
            <div><h3>{branch.name}</h3><span>{branch.code} · {branch.active ? "Activa" : "Inactiva"}</span></div>
            <span className={branch.cashOpen ? "branch-status open" : "branch-status closed"}>{branch.cashOpen ? "Caja abierta" : "Caja cerrada"}</span>
          </div>
          <p>{branch.address ?? "Sin dirección registrada"}</p>
          <div className="branch-admin-stats">
            <div><span>Operaciones hoy</span><strong>{branch.operationsToday}</strong></div>
            <div><span>Comisión hoy</span><strong>{currency(branch.commissionToday)}</strong></div>
            <div><span>Límite operación</span><strong>{currency(branch.settings.maxOperationAmount)}</strong></div>
            <div><span>Comisión</span><strong>{branch.settings.commissionType === "FLAT" ? currency(branch.settings.commissionValue) : `${branch.settings.commissionValue}%`}</strong></div>
          </div>
          <div className="branch-card-actions">
            <button className="soft full" onClick={() => onDetail(branch)}><Eye size={15} /> Ver filial</button>
            <button className="soft full" onClick={() => onSettings(branch)}><Settings2 size={15} /> Configurar</button>
          </div>
        </section>
      ))}
    </div>
  );
}

function GlobalOperationsPage({ operations, branches, onRefresh }: { operations: GlobalOperation[]; branches: Branch[]; onRefresh: () => Promise<void> }) {
  const [branch, setBranch] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function reverseOperation(op: GlobalOperation) {
    const reason = window.prompt("Motivo del reverso (mínimo 5 caracteres):");
    if (!reason) return;
    try {
      await api(`/api/admin/operations/${op.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      await onRefresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo revertir la operación");
    }
  }

  const filtered = operations.filter((op) => {
    const day = op.created_at.slice(0, 10);
    return (branch === "ALL" || String(op.branch_id) === branch)
      && (type === "ALL" || op.operation_type === type)
      && (!from || day >= from)
      && (!to || day <= to);
  });

  return (
    <section className="card page-card">
      <div className="card-head admin-filter-head">
        <div><strong>Historial consolidado</strong><span>{filtered.length} movimientos</span></div>
        <div className="admin-filters admin-filters-wide">
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="ALL">Todas las filiales</option>
            {branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ALL">Todos los tipos</option>
            <option value="YAPE_TO_CASH">Yape → Efectivo</option>
            <option value="CASH_TO_YAPE">Efectivo → Yape</option>
          </select>
          <label className="date-filter"><span>Desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="date-filter"><span>Hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="filter-clear" onClick={() => { setBranch("ALL"); setType("ALL"); setFrom(""); setTo(""); }}>Limpiar</button>
        </div>
      </div>
      <GlobalOperationsTable operations={filtered} onReverse={reverseOperation} />
    </section>
  );
}

function GlobalOperationsTable({ operations, onReverse }: { operations: GlobalOperation[]; onReverse?: (op: GlobalOperation) => void }) {
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead><tr><th>Fecha / Hora</th><th>Filial</th><th>Tipo</th><th>Cliente</th><th>Referencia</th><th>Monto</th><th>Comisión</th><th>Entregado</th><th>Registró</th><th>Estado</th>{onReverse && <th>Acción</th>}</tr></thead>
        <tbody>
          {operations.map((op) => (
            <tr key={op.id}>
              <td>{dateTime(op.created_at)}</td>
              <td><strong>{op.branch_name}</strong></td>
              <td><span className={`type-pill ${op.operation_type === "YAPE_TO_CASH" ? "yape" : "cash"}`}>{op.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape"}</span></td>
              <td>{op.customer_name ?? "—"}</td>
              <td>{op.reference_code ?? "—"}</td>
              <td>{currency(op.amount)}</td>
              <td>{currency(op.commission)}</td>
              <td>{currency(op.net_amount)}</td>
              <td>{op.registered_by ?? "—"}</td>
              <td><span className={`status ${op.status === "COMPLETED" ? "ok" : "pending"}`}><i />{op.status === "COMPLETED" ? "Completada" : op.status === "IN_PROGRESS" ? "En proceso" : op.status === "CANCELLED" ? "Anulada" : op.status === "REVERSED" ? "Revertida" : op.status}</span></td>
              {onReverse && <td>{["COMPLETED","CANCELLED"].includes(op.status) ? <button className="mini-button danger-mini" onClick={() => onReverse(op)}>Revertir</button> : "—"}</td>}
            </tr>
          ))}
          {!operations.length && <tr><td colSpan={onReverse ? 11 : 10} className="empty-cell">No hay operaciones.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CashAdminPage({ branches, closures }: { branches: Branch[]; closures: Closure[] }) {
  const [branch, setBranch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [expandedClosure, setExpandedClosure] = useState<number | null>(null);
  const [closureDetails, setClosureDetails] = useState<Record<number, ClosureDetail>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<number, string>>({});
  const [invoiceClosure, setInvoiceClosure] = useState<Closure | null>(null);
  const [electronicDocuments, setElectronicDocuments] = useState<Record<number, any>>({});
  const selectedBranchName = branch === "ALL"
    ? "Mostrar todos"
    : branches.find((item) => String(item.id) === branch)?.name;
  const visibleBranches = branch === "ALL"
    ? branches
    : branches.filter((item) => String(item.id) === branch);
  const filteredClosures = closures.filter((item) => {
    const day = item.closed_at.slice(0, 10);
    return (branch === "ALL" || String(item.branch_id) === branch)
      && (!from || day >= from)
      && (!to || day <= to);
  });

  function chooseBranch(value: string) {
    setBranch(value);
    setBranchPickerOpen(false);
    setExpandedClosure(null);
  }

  async function toggleClosure(item: Closure) {
    if (expandedClosure === item.id) {
      setExpandedClosure(null);
      return;
    }
    setExpandedClosure(item.id);
    setDetailErrors((current) => ({ ...current, [item.id]: "" }));
    if (closureDetails[item.id]) return;
    setDetailLoading(item.id);
    try {
      const detail = await api<ClosureDetail>(`/api/branches/${item.branch_id}/closures/${item.id}/detail`);
      setClosureDetails((current) => ({ ...current, [item.id]: detail }));
    } catch (err) {
      setDetailErrors((current) => ({
        ...current,
        [item.id]: err instanceof Error ? err.message : "No se pudo cargar el detalle"
      }));
    } finally {
      setDetailLoading(null);
    }
  }

  const branchPicker = (
    <div className={`report-branch-picker cash-picker ${branch ? "inline" : "start"}`}>
      <div className="report-branch-picker-copy">
        <span className="report-branch-picker-icon"><Building2 size={17} /></span>
        <span><strong>{branch ? "Filial de cierres" : "Selecciona una filial"}</strong><small>{branch ? selectedBranchName : "Elige qué cierres deseas consultar"}</small></span>
      </div>
      <div className="report-branch-picker-menu-wrap">
        <button type="button" className="report-branch-picker-trigger" aria-expanded={branchPickerOpen} onClick={()=>setBranchPickerOpen(!branchPickerOpen)}>
          <span>{branch ? "Cambiar selección" : "Seleccionar filial"}</span><ChevronDown size={15}/>
        </button>
        {branchPickerOpen && <div className="report-branch-picker-menu" aria-label="Seleccionar filial para cierres">
          <button type="button" className={branch==="ALL"?"selected":""} aria-pressed={branch==="ALL"} onClick={()=>chooseBranch("ALL")}>
            <span className="branch-option-mark"><Building2 size={14}/></span><span><strong>Mostrar todos</strong><small>Cajas y cierres de todas las filiales</small></span>
          </button>
          {branches.map((item)=><button type="button" key={item.id} className={branch===String(item.id)?"selected":""} aria-pressed={branch===String(item.id)} onClick={()=>chooseBranch(String(item.id))}>
            <span className="branch-option-mark"><Building2 size={14}/></span><span><strong>{item.name}</strong><small>{item.cashOpen ? "Caja abierta" : "Caja cerrada"} · Ver cierres</small></span>
          </button>)}
        </div>}
      </div>
    </div>
  );

  return (
    <>
      {!branch && <section className="card report-select-start">
        <div><strong>¿Qué cajas y cierres deseas revisar?</strong><span>Pulsa el selector y elige una filial o muestra todas para cargar la información.</span></div>
        {branchPicker}
      </section>}

      {branch && <>
        <section className="cash-admin-overview">
          <section className="card cash-branch-status">
            <div className="card-head"><div><strong>{branch === "ALL" ? "Estado de las cajas" : `Estado de caja · ${selectedBranchName}`}</strong><span>{branch === "ALL" ? `${branches.length} filiales` : "Estado actual de la filial seleccionada"}</span></div></div>
            <div className="branch-cash-grid cash-admin-branch-grid">
              {visibleBranches.map((item) => (
                <section className="card branch-cash-card" key={item.id}>
                  <div><div className="branch-monogram">{item.code.slice(0,2)}</div><div><strong>{item.name}</strong><span>{item.address ?? "Sin dirección"}</span></div></div>
                  <span className={item.cashOpen ? "branch-status open" : "branch-status closed"}>{item.cashOpen ? "ABIERTA" : "CERRADA"}</span>
                </section>
              ))}
            </div>
          </section>
          {branchPicker}
        </section>

        <section className="card page-card">
          <div className="card-head admin-filter-head">
            <div><strong>{branch === "ALL" ? "Historial de cierres · todas las filiales" : `Historial de cierres · ${selectedBranchName}`}</strong><span>{filteredClosures.length} cierres encontrados · {from || "Desde el inicio"}{to ? ` a ${to}` : ""}</span></div>
            <div className="admin-filters admin-filters-wide">
              <label className="date-filter"><span>Desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="date-filter"><span>Hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
              <button className="filter-clear" onClick={() => { setFrom(""); setTo(""); }}>Limpiar fechas</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table cash-closure-table">
              <thead><tr><th>Fecha</th><th>Filial</th><th>Responsable</th><th>Resultado</th><th>Operaciones</th><th>Comisión</th><th>Diferencias</th><th>Acciones</th></tr></thead>
              <tbody>
                {filteredClosures.map((item) => {
                  const open = expandedClosure === item.id;
                  const detail = closureDetails[item.id];
                  const electronicDocument = electronicDocuments[item.id] ?? (
                    item.electronic_boleta_status
                      ? { status: item.electronic_boleta_status, series: item.electronic_boleta_series, correlativo: item.electronic_boleta_number }
                      : null
                  );
                  const boletaNumber = electronicDocument?.series
                    ? String(electronicDocument.series) + "-" + String(electronicDocument.correlativo ?? "").padStart(6, "0")
                    : "";
                  return <Fragment key={item.id}>
                    <tr>
                      <td>{dateTime(item.closed_at)}</td><td><strong>{item.branch_name}</strong></td>
                      <td>{item.closed_by ?? "—"}</td>
                      <td><span className={`branch-status ${closureResult(item).cls}`}>{closureResult(item).label}</span></td>
                      <td>{item.operation_count ?? 0}</td>
                      <td><strong>{currency(item.commission_total)}</strong><br/><small>Ganancia del encargado</small></td>
                      <td><span className={Math.abs(Number(item.difference_cash)) < 0.005 ? "green-text" : "red-text"}>Efectivo {currency(item.difference_cash)}</span><br/><span className={Math.abs(Number(item.difference_wallet)) < 0.005 ? "green-text" : "red-text"}>Yape {currency(item.difference_wallet)}</span></td>
                      <td><div className="closure-actions">
                        <button className="mini-button" aria-expanded={open} onClick={() => void toggleClosure(item)}><ChevronDown size={12} className={open ? "closure-chevron open" : "closure-chevron"}/>{open ? "Ocultar" : "Detalle"}</button>
                        <button className="mini-button" onClick={() => window.open(`/api/branches/${item.branch_id}/closures/${item.id}/pdf`, "_blank")}><Download size={12}/> PDF</button>
                        <button className="mini-button closure-invoice-button" title={electronicDocument?.status === "ACCEPTED" ? "Ver boleta electrónica enviada a SUNAT" : "Emitir boleta electrónica para este cierre"} onClick={() => setInvoiceClosure(item)}>{electronicDocument?.status === "ACCEPTED" ? <Eye size={12}/> : <ReceiptText size={12}/>} {electronicDocument?.status === "ACCEPTED" ? "Ver " + boletaNumber : "Boleta electrónica"}</button>
                      </div></td>
                    </tr>
                    {open && <tr className="closure-detail-row"><td colSpan={8}>
                      <div className="closure-detail-panel">
                        <div className="closure-detail-heading"><div><strong>Detalle del cierre #{item.id}</strong><span>{item.branch_name} · {detail?.operations.length ?? item.operation_count ?? 0} operaciones incluidas</span></div><span>Esperado {currency(detail?.closure.expected_cash ?? item.expected_cash)} efectivo · {currency(detail?.closure.expected_wallet ?? item.expected_wallet)} Yape</span></div>
                        {detailLoading === item.id && <div className="closure-detail-message">Cargando operaciones de este turno…</div>}
                        {detailErrors[item.id] && <div className="closure-detail-error">{detailErrors[item.id]}</div>}
                        {detail && <div className="closure-operation-list">
                          {!detail.operations.length ? <div className="closure-detail-message">Este cierre no contiene operaciones registradas.</div> :
                            <div className="table-wrap">
                              <table className="admin-table closure-operation-table">
                                <thead><tr><th>Fecha / hora</th><th>Operación</th><th>Cliente</th><th>Referencia</th><th>Importe</th><th>Comisión</th><th>Entregado</th><th>Estado</th><th>Encargado</th></tr></thead>
                                <tbody>{detail.operations.map((op) => <tr key={op.id}>
                                  <td>{dateTime(op.created_at)}</td>
                                  <td><span className={`operation-badge ${op.operation_type === "YAPE_TO_CASH" ? "purple" : "green"}`}>{op.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape"}</span></td>
                                  <td>{op.customer_name || "—"}</td>
                                  <td>{op.reference_code || "—"}{op.receipt_series && <small className="closure-receipt-ref"><br/>Comp. {op.receipt_series}-{String(op.receipt_number ?? "").padStart(6,"0")}</small>}</td>
                                  <td>{currency(op.amount)}</td><td>{currency(op.commission)}</td><td>{currency(op.net_amount)}</td>
                                  <td><span className={`status ${op.status === "COMPLETED" ? "ok" : "pending"}`}><i/>{op.status === "COMPLETED" ? "Completada" : op.status === "IN_PROGRESS" ? "En proceso" : op.status === "CANCELLED" ? "Anulada" : op.status === "REVERSED" ? "Revertida" : op.status}</span>{op.latest_event_reason && <small className="closure-event-reason">{op.latest_event_action === "CANCEL" ? "Anulación" : "Reverso"}: {op.latest_event_reason}</small>}</td>
                                  <td>{op.registered_by || "—"}</td>
                                </tr>)}</tbody>
                              </table>
                            </div>}
                          <div className="closure-detail-footer"><span>Conciliación declarada: efectivo {currency(detail.closure.declared_cash)} · Yape {currency(detail.closure.declared_wallet)}</span>{detail.closure.notes && <span>Observación: {detail.closure.notes}</span>}</div>
                        </div>}
                      </div>
                    </td></tr>}
                  </Fragment>;
                })}
                {!filteredClosures.length && <tr><td colSpan={8} className="empty-cell">No hay cierres para esos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </>}

      {invoiceClosure && <ClosureBillingModal
        closure={invoiceClosure}
        onClose={() => setInvoiceClosure(null)}
        onDocumentChange={(document) => setElectronicDocuments((current) => ({ ...current, [invoiceClosure.id]: document }))}
      />}
      
    </>
  );
}

function ClosureBillingModal({ closure, onClose, onDocumentChange }: { closure: Closure; onClose: () => void; onDocumentChange: (document: any) => void }) {
  const [config, setConfig] = useState<{hasToken:boolean;hasRuc:boolean;hasSeries:boolean;rusActivityConfirmed:boolean;endpointMode:string} | null>(null);
  const [document, setDocument] = useState<any>(null);
  const [customerDocumentType, setCustomerDocumentType] = useState<"1"|"6">("1");
  const [customerDocumentNumber, setCustomerDocumentNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [statusResult, documentResult] = await Promise.all([
          api<{hasToken:boolean;hasRuc:boolean;hasSeries:boolean;rusActivityConfirmed:boolean;endpointMode:string}>("/api/admin/factiliza/status"),
          api<{document:any}>(`/api/branches/${closure.branch_id}/closures/${closure.id}/electronic-document`)
        ]);
        setConfig(statusResult);
        setDocument(documentResult.document);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo revisar la configuración de Factiliza.");
      }
    })();
  }, [closure.id, closure.branch_id]);

  const ready = Boolean(config?.hasToken && config?.hasRuc && config?.hasSeries && config?.rusActivityConfirmed);
  const expectedDocLength = customerDocumentType === "1" ? 8 : 11;

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api<{document:any}>(`/api/branches/${closure.branch_id}/closures/${closure.id}/electronic-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerDocumentType, customerDocumentNumber, customerName, customerAddress })
      });
      setDocument(result.document);
      onDocumentChange(result.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir la boleta.");
    } finally {
      setLoading(false);
    }
  }

  const configItems = [
    ["Token Factiliza", config?.hasToken],
    ["RUC emisor", config?.hasRuc],
    ["Serie boleta", config?.hasSeries],
    ["Actividad RUS confirmada", config?.rusActivityConfirmed]
  ] as const;

  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className="modal closure-invoice-modal" role="dialog" aria-modal="true" aria-labelledby="closure-invoice-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><h2 id="closure-invoice-title">Boleta electrónica · cierre #{closure.id}</h2><p>{closure.branch_name} · {dateTime(closure.closed_at)}</p></div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
      <div className="invoice-closure-summary"><span>Comisión del cierre<strong>{currency(closure.commission_total)}</strong></span><span>Régimen<strong>Nuevo RUS · solo boleta</strong></span></div>
      {document?.status === "ACCEPTED" ? <>
        <div className="invoice-success-notice"><CheckCircle2 size={18}/><div><strong>Boleta enviada y aceptada por SUNAT</strong><span>{document.provider_document_id || String(document.series) + "-" + String(document.correlativo).padStart(6, "0")} · {document.provider_message}</span></div></div>
        <div className="invoice-archive-notice">
          <strong>Copia electrónica archivada en el servidor</strong>
          <span>{document.storedFiles?.folder || ("boletas-electronicas/filial-" + closure.branch_id + "/cierre-" + closure.id)}</span>
          <small>PDF {document.storedFiles?.pdf ? "✓" : "pendiente"} · XML {document.storedFiles?.xml ? "✓" : "pendiente"} · CDR {document.storedFiles?.cdr ? "✓" : "pendiente"}</small>
        </div>
        <div className="invoice-download-actions">
          <button className="soft" onClick={() => window.open(`/api/branches/${closure.branch_id}/closures/${closure.id}/electronic-document/pdf`, "_blank")}><Eye size={14}/> Ver boleta PDF</button>
          <button className="soft" onClick={() => window.open(`/api/branches/${closure.branch_id}/closures/${closure.id}/electronic-document/xml`, "_blank")}><Download size={14}/> Descargar XML</button>
          <button className="soft" disabled={!document.storedFiles?.cdr} onClick={() => window.open(`/api/branches/${closure.branch_id}/closures/${closure.id}/electronic-document/cdr`, "_blank")}><Download size={14}/> Descargar CDR</button>
        </div>
      </> : document ? <div className={`invoice-setup-notice ${document.status === "REJECTED" ? "error" : ""}`}><ReceiptText size={18}/><div><strong>{document.status === "UNKNOWN" ? "Estado por confirmar" : document.status === "REJECTED" ? "Factiliza rechazó la boleta" : "Emisión iniciada"}</strong><span>{document.provider_message || "El intento quedó registrado para evitar una emisión duplicada."}</span></div></div> : <>
        <div className="invoice-setup-notice"><ShieldCheck size={18}/><div><strong>Revisa el cliente antes de emitir</strong><span>Se enviará a Factiliza/SUNAT una boleta por la comisión total del cierre. Una vez emitida, no se puede borrar desde este panel.</span></div></div>
        {config && !ready && <div className="billing-config-checklist">
          <strong>Falta completar la configuración del servidor</strong>
          {configItems.map(([label, ok]) => <span key={label} className={ok ? "ready" : "missing"}>{ok ? "✓" : "•"} {label}</span>)}
          <small>El token se guarda como secreto del servidor; no lo ingreses en esta pantalla.</small>
        </div>}
        <form className="billing-customer-form" onSubmit={issue}>
          <label><span>Documento del cliente</span><select value={customerDocumentType} onChange={(event) => { setCustomerDocumentType(event.target.value as "1"|"6"); setCustomerDocumentNumber(""); }}><option value="1">DNI</option><option value="6">RUC</option></select></label>
          <label><span>Número de documento</span><input required inputMode="numeric" maxLength={expectedDocLength} minLength={expectedDocLength} value={customerDocumentNumber} onChange={(event) => setCustomerDocumentNumber(event.target.value.replace(/\D/g,"").slice(0,expectedDocLength))}/></label>
          <label className="full"><span>Nombre o razón social</span><input required maxLength={140} value={customerName} onChange={(event) => setCustomerName(event.target.value)}/></label>
          <label className="full"><span>Dirección <small>Opcional</small></span><input maxLength={255} value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)}/></label>
          {error && <div className="billing-form-error full">{error}</div>}
          <div className="modal-actions full"><button type="button" className="soft" onClick={onClose}>Cancelar</button><button className="primary" disabled={!ready || loading || Boolean(document)}>{loading ? "Enviando a Factiliza…" : "Emitir boleta"}</button></div>
        </form>
      </>}
      {config?.endpointMode === "PRUEBAS" && <div className="billing-sandbox-label">Entorno Factiliza de pruebas</div>}
    </section>
  </div>;
}

function UsersPage({ users, branches, onDetail }: { users: AdminUser[]; branches: Branch[]; onDetail: (userId: number) => void }) {
  const staff = users.filter((item) => item.role_code === "CASHIER" && Boolean(item.active));
  return (
    <section className="card page-card">
      <div className="card-head"><div><strong>Encargados de filial</strong><span>{staff.length} encargados activos · {branches.length} filiales</span></div></div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Nombre</th><th>Cuenta</th><th>Filial</th><th>Último acceso</th><th></th></tr></thead>
          <tbody>
            {staff.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.full_name}</strong></td>
                <td>{item.username}</td>
                <td>{item.branch_name ?? "Sin filial"}</td>
                <td>{dateTime(item.last_login_at)}</td>
                <td><button className="mini-button" onClick={() => onDetail(item.id)}><Eye size={13}/> Detalles</button></td>
              </tr>
            ))}
            {!staff.length && <tr><td colSpan={5} className="empty-cell">Todavía no hay encargados activos.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserDetailModal({ userId, onClose, onEdit }: { userId: number; onClose: () => void; onEdit: (user: AdminUser) => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setDetail(await api<UserDetail>(`/api/admin/users/${userId}/detail`));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el detalle");
      }
    })();
  }, [userId]);

  return <div className="modal-backdrop">
    <div className="modal user-detail-modal">
      <div className="modal-head">
        <div><h2>Detalles del encargado</h2><p>{detail ? `${detail.user.full_name} · ${detail.user.branch_name ?? "Sin filial"}` : "Cargando información…"}</p></div>
        <button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button>
      </div>
      {error && <div className="modal-error">{error}</div>}
      {!detail && !error && <div className="owner-loading">Cargando…</div>}
      {detail && <>
        <div className="user-earnings-grid">
          <div><span>Ganancia hoy</span><strong>{currency(detail.metrics.earningsToday)}</strong></div>
          <div><span>Ganancia acumulada</span><strong>{currency(detail.metrics.earningsTotal)}</strong></div>
          <div><span>Operaciones hoy</span><strong>{detail.metrics.operationsToday}</strong></div>
          <div><span>Operaciones acumuladas</span><strong>{detail.metrics.operationsTotal}</strong></div>
        </div>
        <div className="user-detail-summary">
          <div><span>Usuario</span><strong>{detail.user.username}</strong></div>
          <div><span>Filial</span><strong>{detail.user.branch_name ?? "—"}</strong></div>
          <div><span>Último acceso</span><strong>{dateTime(detail.user.last_login_at)}</strong></div>
          <div><span>Caja actual</span><strong>{detail.openCash ? "Abierta" : "Cerrada"}</strong></div>
        </div>
        <div className="user-recent-activity">
          <strong>Actividad reciente</strong>
          <div className="user-activity-table-wrap"><table className="admin-table compact-user-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Ganancia</th><th>Estado</th></tr></thead>
            <tbody>
              {detail.recentOperations.map((op)=><tr key={op.id}>
                <td>{dateTime(op.created_at)}</td>
                <td>{op.operation_type==="YAPE_TO_CASH"?"Yape → Efectivo":"Efectivo → Yape"}</td>
                <td>{currency(op.amount)}</td>
                <td><strong>{currency(op.commission)}</strong></td>
                <td>{op.status==="COMPLETED"?"Completada":op.status==="CANCELLED"?"Anulada":op.status==="REVERSED"?"Revertida":"En proceso"}</td>
              </tr>)}
              {!detail.recentOperations.length && <tr><td colSpan={5} className="empty-cell">Sin operaciones todavía.</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>Cerrar</button>
          <button className="primary" onClick={() => onEdit(detail.user)}><Pencil size={14}/> Editar cuenta</button>
        </div>
      </>}
    </div>
  </div>;
}

function CommissionsPage({ branches, onSettings }: { branches: Branch[]; onSettings: (branch: Branch) => void }) {
  return (
    <section className="card page-card">
      <div className="card-head"><div><strong>Reglas de comisión</strong><span>Configuración independiente por filial</span></div></div>
      <div className="commission-grid">
        {branches.map((branch) => (
          <div className="commission-card" key={branch.id}>
            <div className="branch-monogram">{branch.code.slice(0,2)}</div>
            <div className="commission-main">
              <strong>{branch.name}</strong>
              <span>Límite {currency(branch.settings.maxOperationAmount)}</span>
              <div className="commission-value">{branch.settings.commissionType === "FLAT" ? currency(branch.settings.commissionValue) : `${branch.settings.commissionValue}%`} <small>por operación</small></div>
              <div className="share-line"><span>La comisión corresponde al encargado</span></div>
            </div>
            <button className="mini-button" onClick={() => onSettings(branch)}><Settings2 size={13} /> Editar</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminReports({ overview }: { overview: Overview; operations: GlobalOperation[]; closures: Closure[] }) {
  const now = new Date();
  const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
  const [from, setFrom] = useState(localToday.slice(0,8) + "01");
  const [to, setTo] = useState(localToday);
  const [branch, setBranch] = useState("");
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [flow, setFlow] = useState<"ALL" | "YAPE_TO_CASH" | "CASH_TO_YAPE">("ALL");
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function queryString() {
    const p = new URLSearchParams();
    if (branch && branch !== "ALL") p.set("branchId", branch);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }

  async function loadReport() {
    if (!branch) { setReport(null); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      setReport(await api<FinancialReport>(`/api/admin/reports/summary?${queryString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el reporte");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!branch) { setReport(null); setError(""); setLoading(false); return; }
    void loadReport();
  }, [from, to, branch]);

  const selectedBranchName = branch === "ALL"
    ? "Mostrar todos"
    : overview.branches.find((item) => String(item.id) === branch)?.name;
  function chooseBranch(value: string) {
    setReport(null);
    setBranch(value);
    setBranchPickerOpen(false);
  }
  const branchPicker = (
    <div className={`report-branch-picker ${branch ? "inline" : "start"}`}>
      <div className="report-branch-picker-copy">
        <span className="report-branch-picker-icon"><Building2 size={17} /></span>
        <span><strong>{branch ? "Filial del reporte" : "Selecciona una filial"}</strong><small>{branch ? selectedBranchName : "Elige una opción para cargar el reporte"}</small></span>
      </div>
      <div className="report-branch-picker-menu-wrap">
        <button type="button" className="report-branch-picker-trigger" aria-expanded={branchPickerOpen} onClick={()=>setBranchPickerOpen(!branchPickerOpen)}>
          <span>{branch ? "Cambiar selección" : "Seleccionar filial"}</span><ChevronDown size={15}/>
        </button>
        {branchPickerOpen && <div className="report-branch-picker-menu" aria-label="Seleccionar filial">
          <button type="button" className={branch==="ALL"?"selected":""} aria-pressed={branch==="ALL"} onClick={()=>chooseBranch("ALL")}>
            <span className="branch-option-mark"><Building2 size={14}/></span><span><strong>Mostrar todos</strong><small>Reporte consolidado de todas las filiales</small></span>
          </button>
          {overview.branches.map((item)=><button type="button" key={item.id} className={branch===String(item.id)?"selected":""} aria-pressed={branch===String(item.id)} onClick={()=>chooseBranch(String(item.id))}>
            <span className="branch-option-mark"><Building2 size={14}/></span><span><strong>{item.name}</strong><small>Ver reporte de esta filial</small></span>
          </button>)}
        </div>}
      </div>
    </div>
  );
  const registerRows = (report?.operations ?? []).filter((row) => flow === "ALL" || row.operation_type === flow);
  const enteredTotal = registerRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const deliveredTotal = registerRows.reduce((sum, row) => sum + Number(row.net_amount), 0);
  const commissionTotal = registerRows.reduce((sum, row) => sum + Number(row.commission), 0);
  const enteredLabel = flow === "YAPE_TO_CASH" ? "Ingreso Yape" : flow === "CASH_TO_YAPE" ? "Ingreso efectivo" : "Entrada según operación";
  const deliveredLabel = flow === "YAPE_TO_CASH" ? "Salida efectivo" : flow === "CASH_TO_YAPE" ? "Salida Yape" : "Entrega según operación";

  function download(kind: "xlsx" | "pdf") {
    window.open(`/api/admin/reports/export.${kind}?${queryString()}`, "_blank");
  }

  return (
    <>
      <section className="card report-toolbar">
        <div className="report-toolbar-title"><BarChart3 size={19}/><div><strong>Reporte financiero</strong><span>Elige una filial para consultar sus operaciones y exportar el resultado.</span></div></div>
        <div className="admin-filters admin-filters-wide">
          <label className="date-filter"><span>Desde</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></label>
          <label className="date-filter"><span>Hasta</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></label>
          <button className="soft export-button" disabled={!branch} onClick={()=>download("pdf")}><Download size={14}/> PDF</button>
          <button className="primary export-button" disabled={!branch} onClick={()=>download("xlsx")}><Download size={14}/> Excel</button>
        </div>
      </section>
      {!branch && <section className="card report-select-start">
        <div><strong>¿Qué reporte deseas consultar?</strong><span>Pulsa el selector, elige una filial o muestra todas para cargar los datos.</span></div>
        {branchPicker}
      </section>}

      {error && <div className="error-banner">{error}</div>}
      {loading && branch && !report && <div className="owner-loading">Cargando reporte…</div>}

      {branch && report && <>
        <div className="owner-kpis reports-owner-kpis stage3-kpis">
          <OwnerKpi icon={<ReceiptText />} tone="blue" label="Operaciones" value={String(report.summary.operationCount)} />
          <OwnerKpi icon={<BadgeDollarSign />} tone="green" label="Monto movilizado" value={currency(report.summary.amountTotal)} />
          <OwnerKpi icon={<CircleDollarSign />} tone="orange" label="Ganancia de encargados" value={currency(report.summary.commissionTotal)} />
          {branchPicker}
        </div>

        <section className="card report-register-card">
          <div className="report-register-heading">
            <div><strong>Registro diario de operaciones</strong><span>{branch === "ALL" ? "Todas las filiales" : overview.branches.find((item)=>String(item.id)===branch)?.name} · {from} a {to}</span></div>
            <div className="report-flow-filters" aria-label="Filtrar tipo de operación">
              <button type="button" className={flow==="ALL"?"active":""} onClick={()=>setFlow("ALL")}>Todas</button>
              <button type="button" className={flow==="YAPE_TO_CASH"?"active":""} onClick={()=>setFlow("YAPE_TO_CASH")}>Yape → Efectivo</button>
              <button type="button" className={flow==="CASH_TO_YAPE"?"active":""} onClick={()=>setFlow("CASH_TO_YAPE")}>Efectivo → Yape</button>
            </div>
          </div>
          <div className="report-register-wrap">
            <table className="report-register-table">
              <thead><tr>
                <th>Fecha / hora</th><th>N.º operación / referencia</th><th>Concepto / cliente / filial</th>
                <th>{enteredLabel} (S/)</th><th>{deliveredLabel} (S/)</th>
                <th>Comisión / ingreso real (S/)</th><th>N.º comprobante interno</th>
              </tr></thead>
              <tbody>
                {registerRows.map((row)=><tr key={row.id}>
                  <td>{dateTime(row.created_at)}</td>
                  <td><strong>Op. {row.id}</strong><small>Ref. {row.reference_code ?? "—"}</small></td>
                  <td><span className={`report-flow-pill ${row.operation_type==="YAPE_TO_CASH"?"yape":"cash"}`}>{row.operation_type==="YAPE_TO_CASH"?"Yape → Efectivo":"Efectivo → Yape"}</span><small>{row.customer_name || "Sin nombre"} · {row.branch_name}</small></td>
                  <td>{currency(row.amount)}</td><td>{currency(row.net_amount)}</td><td>{currency(row.commission)}</td>
                  <td>{row.series && row.sequence_number ? `${row.series}-${String(row.sequence_number).padStart(6,"0")}` : "—"}</td>
                </tr>)}
                {!registerRows.length && <tr><td colSpan={7} className="empty-cell">{loading ? "Actualizando reporte…" : "No hay operaciones para estos filtros."}</td></tr>}
              </tbody>
              {registerRows.length>0 && <tfoot><tr>
                <th colSpan={3}>TOTAL DEL PERIODO · {registerRows.length} operaciones</th>
                <th>{currency(enteredTotal)}</th><th>{currency(deliveredTotal)}</th><th>{currency(commissionTotal)}</th><th>{registerRows.filter((row)=>row.series && row.sequence_number).length} comprobantes</th>
              </tr></tfoot>}
            </table>
          </div>
          <div className="report-register-note">Los movimientos de entrada y entrega cambian según el tipo de operación. El comprobante listado es interno y no es una boleta electrónica SUNAT.</div>
          {(report.operations?.length ?? 0)>=5000 && <div className="report-register-limit">Se muestran como máximo 5,000 operaciones. Reduce el periodo para consultar más detalle.</div>}
        </section>
      </>}
    </>
  );
}

function ScaleIcon() {
  return <ClipboardCheck />;
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    LOGIN: "Inicio de sesión",
    LOGIN_FAILED: "Inicio de sesión fallido",
    LOGOUT: "Cierre de sesión",
    OPERATION_CREATED: "Operación registrada",
    OPERATION_CANCELLED: "Operación anulada",
    OPERATION_REVERSED: "Operación revertida",
    CASH_OPENED: "Caja abierta",
    CASH_CLOSED: "Caja cerrada",
    CASH_HANDOFF: "Cambio de encargado",
    PASSWORD_CHANGED: "Contraseña cambiada",
    SYSTEM_SETTINGS_UPDATED: "Configuración general actualizada",
    DEFAULT_RULES_APPLIED_TO_BRANCHES: "Reglas generales aplicadas a filiales",
    SESSION_REVOKED: "Sesión cerrada por administración",
    USER_SESSIONS_REVOKED: "Sesiones de usuario cerradas",
    ROLE_PERMISSIONS_UPDATED: "Permisos de rol actualizados",
    BRANCH_CREATED: "Filial creada",
    BRANCH_SETTINGS_UPDATED: "Configuración de filial actualizada",
    BRANCH_UPDATED: "Filial actualizada",
    USER_CREATED: "Usuario creado",
    USER_PASSWORD_RESET: "Contraseña de usuario restablecida",
    USER_STATUS_CHANGED: "Estado de usuario actualizado",
    USER_UPDATED: "Usuario actualizado",
    DATABASE_BACKUP_CREATED: "Copia de base de datos creada",
    DATABASE_BACKUP_RESTORED: "Copia de base de datos restaurada"
  };
  return labels[action] ?? "Evento del sistema";
}

function auditEntityLabel(entity: string | null) {
  if (!entity) return "—";
  const labels: Record<string, string> = {
    USER: "Usuario",
    AUTH_SESSION: "Sesión",
    OPERATION: "Operación",
    SYSTEM: "Sistema",
    BRANCH: "Filial",
    CASH_SESSION: "Turno de caja",
    DAILY_CLOSURE: "Cierre diario",
    ROLE: "Rol",
    DATABASE: "Base de datos"
  };
  return labels[entity] ?? "Registro";
}

function AuditPage({ rows }: { rows: AuditRow[] }) {
  return (
    <section className="card page-card">
      <div className="card-head"><div><strong>Bitácora de seguridad</strong><span>{rows.length} eventos recientes</span></div></div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Fecha / Hora</th><th>Usuario</th><th>Filial</th><th>IP</th><th>Acción</th><th>Entidad</th><th>N.º</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td>{dateTime(row.created_at)}</td><td><strong>{row.user_name ?? "Sistema"}</strong><br/><small>{row.username ?? ""}</small></td><td>{row.branch_name ?? "Global"}</td><td>{row.ip_address ?? "—"}</td><td><span className="audit-action">{auditActionLabel(row.action)}</span></td><td>{auditEntityLabel(row.entity_type)}</td><td>{row.entity_id ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type BackupFile = { filename: string; size: number; createdAt: string };

function BackupPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const result = await api<{ backups: BackupFile[] }>("/api/admin/backups");
      setBackups(result.backups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las copias");
    }
  }

  useEffect(() => { void load(); }, []);

  async function createBackup() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ filename: string }>("/api/admin/backups", { method: "POST" });
      setMessage("Copia creada: " + result.filename);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la copia");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBackup() {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ filename: string }>("/api/admin/backups/upload", {
        method: "POST",
        headers: { "Content-Type": "application/gzip" },
        body: file
      });
      setMessage("Copia subida y validada: " + result.filename + ". Ahora puedes restaurarla.");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la copia");
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup(item: BackupFile) {
    const confirmation = window.prompt(
      "Restaurar " + item.filename + " reemplazará los datos actuales. Escribe RESTAURAR para continuar."
    );
    if (confirmation !== "RESTAURAR") return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ safetyCopy: string }>("/api/admin/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: item.filename, confirmation })
      });
      setMessage("Base de datos restaurada. Copia de seguridad previa: " + result.safetyCopy);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar la copia");
    } finally {
      setBusy(false);
    }
  }

  function sizeLabel(bytes: number) {
    return bytes < 1024 * 1024
      ? (bytes / 1024).toFixed(1) + " KB"
      : (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="backup-page">
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      <div className="backup-grid">
        <section className="card backup-card">
          <div className="backup-card-heading">
            <span className="backup-icon backup-icon-blue"><Database size={17}/></span>
            <div><strong>Crear una copia</strong><span>Guarda el estado actual de toda la base de datos.</span></div>
          </div>
          <div className="backup-card-body">
            <p>La copia queda en este servidor. Descárgala para guardar otra copia en tu equipo.</p>
            <button className="primary" type="button" disabled={busy} onClick={()=>void createBackup()}>
              <Database size={14}/> {busy ? "Procesando…" : "Crear copia"}
            </button>
          </div>
        </section>

        <section className="card backup-card">
          <div className="backup-card-heading">
            <span className="backup-icon backup-icon-purple"><Upload size={17}/></span>
            <div><strong>Subir una copia</strong><span>Archivo .sql.gz, hasta 100 MB.</span></div>
          </div>
          <div className="backup-card-body">
            <label className="backup-file-picker">
              <Upload size={15}/>
              <span>{file ? file.name : "Seleccionar archivo de copia"}</span>
              <input type="file" accept=".sql.gz,application/gzip" onChange={(event)=>setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button className="soft" type="button" disabled={busy || !file} onClick={()=>void uploadBackup()}>
              {busy ? "Procesando…" : "Subir y validar"}
            </button>
            <p>Subir no cambia los datos. Luego podrás elegir Restaurar en la copia.</p>
          </div>
        </section>
      </div>

      <div className="backup-safety-note">
        <ShieldCheck size={16}/>
        <span>Antes de restaurar, cierra las cajas abiertas. El sistema crea una copia de seguridad automática.</span>
      </div>

      <section className="card backup-list-card">
        <div className="backup-list-heading">
          <div><strong>Copias guardadas</strong><span>{backups.length} {backups.length === 1 ? "copia disponible" : "copias disponibles"} en este servidor</span></div>
          <button className="soft" type="button" disabled={busy} onClick={()=>void load()}><RefreshCw size={14}/> Actualizar</button>
        </div>
        {backups.length ? (
          <div className="backup-list">
            {backups.map((item)=><div className="backup-row" key={item.filename}>
              <span className="backup-icon backup-icon-muted"><Database size={15}/></span>
              <div className="backup-file-info"><strong title={item.filename}>{item.filename}</strong><span>{dateTime(item.createdAt)} · {sizeLabel(item.size)}</span></div>
              <div className="backup-row-actions">
                <a className="mini-button" href={"/api/admin/backups/" + encodeURIComponent(item.filename) + "/download"}><Download size={13}/> Descargar</a>
                <button className="mini-button danger-mini" type="button" disabled={busy} onClick={()=>void restoreBackup(item)}>Restaurar</button>
              </div>
            </div>)}
          </div>
        ) : <div className="backup-empty"><Database size={20}/><strong>Aún no hay copias</strong><span>Crea una copia para verla aquí y poder descargarla o restaurarla.</span></div>}
      </section>
    </div>
  );
}

function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [form, setForm] = useState<SystemSettings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api<SystemSettings>("/api/admin/system/settings");
      setSettings(data);
      setForm(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la configuración");
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await api("/api/admin/system/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setMessage("Configuración general guardada.");
      window.dispatchEvent(new Event("zflow:branding-updated"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function applyDefaults() {
    if (!window.confirm("Esto aplicará las reglas generales de comisión y límite a todas las filiales. ¿Continuar?")) return;
    try {
      const result = await api<{ affectedBranches: number }>("/api/admin/system/apply-defaults-to-branches", { method: "POST" });
      setMessage("Reglas aplicadas a " + result.affectedBranches + " filiales.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron aplicar las reglas");
    }
  }

  if (!form) return <div className="owner-loading">Cargando configuración…</div>;

  return (
    <form className="stage4-settings-layout" onSubmit={save}>
      <section className="card stage4-settings-card">
        <div className="card-head"><div><strong>Identidad del negocio</strong><span>Datos usados en documentos internos y configuración local.</span></div><Store size={17}/></div>
        <div className="settings-form-body">
          <div className="field-grid">
            <label>Nombre comercial<input value={form.businessName} onChange={(e)=>setForm({...form,businessName:e.target.value})} required /></label>
            <label>Razón social<input value={form.legalName ?? ""} onChange={(e)=>setForm({...form,legalName:e.target.value || null})} placeholder="Opcional" /></label>
          </div>
          <div className="field-grid">
            <label>RUC<input value={form.ruc ?? ""} onChange={(e)=>setForm({...form,ruc:e.target.value || null})} placeholder="Opcional" /></label>
            <label>Teléfono<input value={form.phone ?? ""} onChange={(e)=>setForm({...form,phone:e.target.value || null})} placeholder="Opcional" /></label>
          </div>
          <label>Logo del negocio
            <div className="logo-upload-row">
              <div className="business-logo-preview">{form.logoDataUrl ? <img src={form.logoDataUrl} alt="Logo" /> : <Store size={22}/>}</div>
              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e)=>{
                    const file=e.target.files?.[0];
                    if(!file) return;
                    if(file.size>2_000_000){ setError("El logo no debe superar 2 MB."); return; }
                    const reader=new FileReader();
                    reader.onload=()=>setForm({...form,logoDataUrl:String(reader.result)});
                    reader.readAsDataURL(file);
                  }}
                />
                {form.logoDataUrl && <button type="button" className="mini-button danger-mini" onClick={()=>setForm({...form,logoDataUrl:null})}>Quitar logo</button>}
              </div>
            </div>
          </label>
          <label>Dirección<input value={form.address ?? ""} onChange={(e)=>setForm({...form,address:e.target.value || null})} placeholder="Dirección principal" /></label>
          <div className="field-grid">
            <label>Moneda<select value={form.currencyCode} onChange={(e)=>setForm({...form,currencyCode:e.target.value})}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></label>
            <label>Zona horaria<select value={form.timezoneName} onChange={(e)=>setForm({...form,timezoneName:e.target.value})}><option value="America/Lima">Perú · America/Lima</option></select></label>
          </div>
          <div className="field-grid">
            <label>Prefijo de comprobante<input value={form.receiptPrefix} onChange={(e)=>setForm({...form,receiptPrefix:e.target.value.toUpperCase()})} placeholder="ZF" /></label>
            <label>Pie del ticket<input value={form.ticketFooter ?? ""} onChange={(e)=>setForm({...form,ticketFooter:e.target.value || null})} placeholder="Mensaje del comprobante interno" /></label>
          </div>
        </div>
      </section>

      <section className="card stage4-settings-card">
        <div className="card-head"><div><strong>Reglas generales</strong><span>Plantilla central para filiales y políticas de operación.</span></div><Settings2 size={17}/></div>
        <div className="settings-form-body">
          <div className="field-grid">
            <label>Límite predeterminado<div className="input-prefix"><span>S/</span><input type="number" min="0.01" step="0.01" value={form.defaultMaxOperationAmount} onChange={(e)=>setForm({...form,defaultMaxOperationAmount:Number(e.target.value)})} /></div></label>
            <label>Tipo de comisión<select value={form.defaultCommissionType} onChange={(e)=>setForm({...form,defaultCommissionType:e.target.value as "FLAT"|"PERCENT"})}><option value="FLAT">Monto fijo</option><option value="PERCENT">Porcentaje</option></select></label>
          </div>
          <label>Valor predeterminado<div className="input-prefix"><span>{form.defaultCommissionType==="FLAT"?"S/":"%"}</span><input type="number" min="0.01" step="0.01" value={form.defaultCommissionValue} onChange={(e)=>setForm({...form,defaultCommissionValue:Number(e.target.value)})} /></div></label>
          <div className="friendly-info"><UserCog size={16}/><span>La comisión generada en cada filial corresponde al encargado asignado.</span></div>
          <label className="active-toggle"><input type="checkbox" checked={form.requireCashToYapeReference} onChange={(e)=>setForm({...form,requireCashToYapeReference:e.target.checked})} /> Exigir referencia también en Efectivo → Yape</label>
          <label className="active-toggle"><input type="checkbox" checked={form.allowCashierCancel} onChange={(e)=>setForm({...form,allowCashierCancel:e.target.checked})} /> Permitir que el cajero anule operaciones mientras su turno está abierto</label>
          <div className="stage4-policy-note"><LockKeyhole size={16}/><span>Las operaciones de turnos cerrados no se editan. Cualquier corrección posterior requiere reverso del propietario y queda en auditoría.</span></div>
          <button type="button" className="soft full" onClick={()=>void applyDefaults()}>Aplicar estas reglas a todas las filiales</button>
        </div>
      </section>

      <div className="stage4-settings-actions">
        <div>{error && <div className="modal-error">{error}</div>}{message && <div className="success-message">{message}</div>}</div>
        <button className="primary" disabled={saving}>{saving?"Guardando…":"Guardar configuración"}</button>
      </div>
      {settings && <small className="stage4-updated">Última modificación: {dateTime(settings.updatedAt)}</small>}
    </form>
  );
}

function SecurityPage({ currentUserId }: { currentUserId: number }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [roles, setRoles] = useState<RolePermissionInfo[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [statusData, sessionData, roleData] = await Promise.all([
        api<SystemStatus>("/api/admin/system/status"),
        api<{ sessions: SecuritySession[] }>("/api/admin/security/sessions"),
        api<{ roles: RolePermissionInfo[]; availablePermissions: string[] }>("/api/admin/security/roles")
      ]);
      setStatus(statusData);
      setSessions(sessionData.sessions ?? []);
      setRoles(roleData.roles ?? []);
      setAvailablePermissions(roleData.availablePermissions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar seguridad");
    }
  }

  useEffect(() => { void load(); }, []);

  async function revoke(session: SecuritySession) {
    if (!window.confirm("Cerrar la sesión de " + session.fullName + "?")) return;
    try {
      await api("/api/admin/security/sessions/" + session.id + "/revoke", { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la sesión");
    }
  }

  async function togglePermission(role: RolePermissionInfo, permission: string) {
    if (role.code === "OWNER") return;
    const next = role.permissions.includes(permission)
      ? role.permissions.filter((item) => item !== permission)
      : [...role.permissions, permission];
    try {
      await api("/api/admin/security/roles/" + role.code + "/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: next })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron actualizar los permisos");
    }
  }

  const permissionLabels: Record<string,string> = {
    GLOBAL_READ: "Lectura global",
    GLOBAL_WRITE: "Escritura global",
    BRANCH_READ: "Ver su filial",
    BRANCH_WRITE: "Operar en su filial",
    USER_ADMIN: "Administrar usuarios",
    BRANCH_USER_ADMIN: "Administrar usuarios de filial",
    AUDIT_READ: "Ver auditoría",
    CANCEL_OPERATION: "Anular operaciones"
  };

  const uptime = status ? Math.floor(status.api.uptimeSeconds/3600) + "h " + Math.floor((status.api.uptimeSeconds%3600)/60) + "m" : "—";

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      <div className="security-status-grid">
        <OwnerKpi icon={<Activity/>} tone="green" label={"API · " + UI_BUILD} value={status?.ok ? "En línea" : "—"} />
        <OwnerKpi icon={<Building2/>} tone="blue" label="Filiales activas" value={String(status?.counts.activeBranches ?? 0)} />
        <OwnerKpi icon={<Users/>} tone="cyan" label="Usuarios activos" value={String(status?.counts.activeUsers ?? 0)} />
        <OwnerKpi icon={<ShieldCheck/>} tone="purple" label="Sesiones activas" value={String(status?.counts.activeSessions ?? 0)} />
        <OwnerKpi icon={<WalletCards/>} tone="orange" label="Cajas abiertas" value={String(status?.counts.openCashSessions ?? 0)} />
      </div>

      <div className="security-detail-grid">
        <section className="card security-runtime-card">
          <div className="card-head"><div><strong>Entorno local</strong><span>Estado del LXC/Docker visto desde la API.</span></div><RefreshCw size={16}/></div>
          <div className="runtime-list">
            <div><span>Tiempo activo de la API</span><strong>{uptime}</strong></div>
            <div><span>Node.js</span><strong>{status?.api.node ?? "—"}</strong></div>
            <div><span>Memoria API</span><strong>{status ? String(status.api.memoryMb) + " MB" : "—"}</strong></div>
            <div><span>MariaDB</span><strong>{status?.database.version ?? "—"}</strong></div>
            <div><span>Operaciones hoy</span><strong>{status?.counts.operationsToday ?? 0}</strong></div>
          </div>
          <button className="soft full" onClick={()=>void load()}><RefreshCw size={14}/> Actualizar estado</button>
          <div className="stage4-command-note"><strong>Diagnóstico del LXC</strong><code>cd /opt/z-flow &amp;&amp; bash scripts/diagnose.sh</code></div>
        </section>

        <section className="card security-runtime-card">
          <div className="card-head"><div><strong>Protecciones activas</strong><span>Políticas de seguridad local.</span></div><ShieldCheck size={16}/></div>
          <div className="security-checks">
            <div><CheckCircle2 size={15}/><span>Sesiones HttpOnly del lado del servidor</span></div>
            <div><CheckCircle2 size={15}/><span>Bloqueo temporal por intentos fallidos</span></div>
            <div><CheckCircle2 size={15}/><span>Permisos por rol y filial validados en el servidor</span></div>
            <div><CheckCircle2 size={15}/><span>Anulaciones y reversos con motivo y auditoría</span></div>
            <div><CheckCircle2 size={15}/><span>Verificaciones de estado de MariaDB, API y sitio web</span></div>
          </div>
        </section>
      </div>

      <section className="card page-card">
        <div className="card-head">
          <div><strong>Permisos por rol</strong><span>Configuración aplicada y validada en el servidor.</span></div>
          <span className="build-badge">Versión {UI_BUILD}</span>
        </div>
        <div className="role-permission-grid">
          {roles.filter((role) => ["OWNER","CASHIER"].includes(role.code)).map((role) => (
            <div className="role-permission-card" key={role.id}>
              <div className="role-permission-head">
                <div><strong>{role.name}</strong><span>Permisos del rol</span></div>
                {role.code === "OWNER" && <em>Protegido</em>}
              </div>
              <div className="role-permission-options">
                {availablePermissions.map((permission) => (
                  <label key={permission}>
                    <input
                      type="checkbox"
                      checked={role.permissions.includes(permission)}
                      disabled={role.code === "OWNER"}
                      onChange={() => void togglePermission(role, permission)}
                    />
                    <span>{permissionLabels[permission] ?? permission}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {!roles.length && <div className="empty-cell">No se pudieron cargar los roles.</div>}
        </div>
      </section>

      <section className="card page-card">
        <div className="card-head"><div><strong>Sesiones</strong><span>Control de accesos abiertos y recientes.</span></div></div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Usuario</th><th>Rol / Filial</th><th>IP</th><th>Inicio</th><th>Expira</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>
              {sessions.map((item)=><tr key={item.id}>
                <td><strong>{item.fullName}</strong><br/><small>@{item.username}</small></td>
                <td>{item.roleName}<br/><small>{item.branchName ?? "Global"}</small></td>
                <td>{item.ipAddress ?? "—"}</td>
                <td>{dateTime(item.createdAt)}</td>
                <td>{dateTime(item.expiresAt)}</td>
                <td><span className={item.active?"branch-status open":"branch-status closed"}>{item.current?"Actual":item.active?"Activa":"Cerrada"}</span></td>
                <td>{item.active && !item.current ? <button className="mini-button danger-mini" onClick={()=>void revoke(item)}>Cerrar sesión</button> : item.current && item.userId===currentUserId ? "Esta sesión" : "—"}</td>
              </tr>)}
              {!sessions.length && <tr><td colSpan={7} className="empty-cell">No hay sesiones registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}


type FactilizaIntegrationStatus = {
  provider: string;
  endpointMode: string;
  baseUrl: string;
  series: string;
  hasToken: boolean;
  hasRuc: boolean;
  hasSeries: boolean;
  rusActivityConfirmed: boolean;
  savedInPanel: boolean;
};

function IntegrationsPage() {
  const [status, setStatus] = useState<FactilizaIntegrationStatus | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://apife-qa.factiliza.com/api/v1");
  const [series, setSeries] = useState("");
  const [rusActivityConfirmed, setRusActivityConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<FactilizaIntegrationStatus>("/api/admin/factiliza/status");
      setStatus(result);
      setBaseUrl(result.baseUrl || "https://apife-qa.factiliza.com/api/v1");
      setSeries(result.series || "");
      setRusActivityConfirmed(result.rusActivityConfirmed);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar la configuración."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      await api<{ok:boolean}>("/api/admin/factiliza/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken, baseUrl, series, rusActivityConfirmed })
      });
      setApiToken("");
      await load();
      setMessage("Configuración de Factiliza guardada.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la configuración."); }
    finally { setSaving(false); }
  }

  const checks = [
    ["Token API", status?.hasToken ?? false],
    ["RUC del emisor", status?.hasRuc ?? false],
    ["Serie de boleta", status?.hasSeries ?? false],
    ["Actividad compatible con Nuevo RUS confirmada", status?.rusActivityConfirmed ?? false]
  ] as const;
  const ready = checks.every(([, ok]) => ok);

  return <div className="integration-page">
    <section className="card integration-hero">
      <div className="integration-brand"><div className="integration-icon"><ReceiptText size={20}/></div><div><span>Proveedor de comprobantes electrónicos</span><h2>Factiliza</h2></div></div>
      <span className={`integration-status ${ready ? "ready" : "pending"}`}><span/> {ready ? "Configuración completa" : "Configuración pendiente"}</span>
      <p>Conecta el API para emitir una boleta por el total de comisión de cada cierre y consultar sus archivos electrónicos.</p>
    </section>

    <div className="integration-grid">
      <section className="card integration-config-card">
        <div className="card-head"><div><strong>Conexión API</strong><span>La credencial se cifra en el servidor y nunca se muestra después de guardarla.</span></div><KeyRound size={17}/></div>
        <form className="integration-form" onSubmit={save}>
          <label className="integration-full"><span>Token API de Factiliza</span><input type="password" autoComplete="new-password" value={apiToken} onChange={(event)=>setApiToken(event.target.value)} placeholder={status?.hasToken ? "Token guardado; déjalo vacío para conservarlo" : "Pega aquí tu token de Factiliza"} /></label>
          <label><span>URL base del API</span><input required type="url" value={baseUrl} onChange={(event)=>setBaseUrl(event.target.value)} placeholder="https://…" /></label>
          <label><span>Serie de boleta asignada</span><input required maxLength={10} value={series} onChange={(event)=>setSeries(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,""))} placeholder="Ej.: B001" /></label>
          <label className="integration-confirm integration-full"><input type="checkbox" checked={rusActivityConfirmed} onChange={(event)=>setRusActivityConfirmed(event.target.checked)}/><span>Confirmé con mi contador que el emisor y su actividad declarada pueden emitir este comprobante bajo el Nuevo RUS.</span></label>
          {error && <div className="billing-form-error integration-full">{error}</div>}
          {message && <div className="integration-saved integration-full"><CheckCircle2 size={15}/>{message}</div>}
          <div className="integration-actions integration-full"><button type="button" className="soft" onClick={()=>void load()} disabled={loading || saving}><RefreshCw size={14}/> Actualizar estado</button><button className="primary" disabled={loading || saving}>{saving ? "Guardando…" : "Guardar conexión"}</button></div>
        </form>
      </section>

      <section className="card integration-check-card">
        <div className="card-head"><div><strong>Estado de configuración</strong><span>{status ? `Ambiente ${status.endpointMode}` : "Consultando Factiliza…"}</span></div><ShieldCheck size={17}/></div>
        <div className="integration-checks">{checks.map(([label, ok])=><div key={label}><span className={ok ? "ok" : "missing"}>{ok ? "✓" : "!"}</span><span>{label}</span><strong>{loading ? "…" : ok ? "Listo" : "Pendiente"}</strong></div>)}</div>
        <div className="integration-ruc-note"><strong>RUC emisor</strong><span>Se toma de Configuración del negocio. Verifica que coincida con el RUC afiliado a Factiliza.</span></div>
        <div className="integration-note">La lista confirma que los datos estén completos. Factiliza valida el token al emitir la primera boleta; no se genera un comprobante de prueba.</div>
        {status?.savedInPanel && <div className="integration-note">La configuración se guarda en esta instalación de Z-FLOW.</div>}
      </section>
    </div>
  </div>;
}

function OwnerProfile({ user }: { user: AuthUser }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setSaving(true);
    try {
      await api<{ ok: boolean }>("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Contraseña actualizada. Las demás sesiones se cerraron.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="owner-profile-grid">
      <section className="card owner-profile-card">
        <div className="profile-head">
          <div className="avatar big">{user.fullName.split(/\\s+/).filter(Boolean).slice(0,2).map((x) => x[0]).join("").toUpperCase()}</div>
          <div><h2>{user.fullName}</h2><p>{user.role.name}</p></div>
        </div>
        <div className="profile-details">
          <div><span>Usuario</span><strong>{user.username}</strong></div>
          <div><span>Alcance</span><strong>Global</strong></div>
          <div><span>Rol</span><strong>{user.role.name}</strong></div>
          <div><span>Último acceso</span><strong>{dateTime(user.lastLoginAt)}</strong></div>
        </div>
        <div className="owner-profile-note"><ShieldCheck size={16}/><span>Esta cuenta administra todo el sistema. Mantén una contraseña única y segura.</span></div>
      </section>

      <section className="card owner-password-card">
        <div className="owner-password-title"><KeyRound size={17}/><div><h3>Cambiar contraseña</h3><p>Confirma la actual y define una nueva.</p></div></div>
        <form className="owner-password-form" onSubmit={changePassword}>
          <label>Contraseña actual<input type="password" autoComplete="current-password" value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} required /></label>
          <label>Nueva contraseña<input type="password" autoComplete="new-password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} minLength={10} required /><small>Mínimo 10 caracteres, con mayúscula, minúscula y número.</small></label>
          <label>Confirmar contraseña<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} minLength={10} required /></label>
          {error && <div className="error-banner">{error}</div>}
          {message && <div className="success-banner">{message}</div>}
          <button className="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Actualizar contraseña"}</button>
        </form>
        <details className="profile-recovery">
          <summary>¿Olvidaste tu contraseña?</summary>
          <p>Desde la carpeta de instalación del servidor, ejecuta este comando para generar una clave temporal:</p>
          <code>docker compose exec api npm run recover:owner-password -- {user.username}</code>
          <p>El comando muestra la clave una sola vez y cierra las sesiones existentes. Inicia sesión con ella y cámbiala aquí.</p>
        </details>
      </section>
    </div>
  );
}

function CreateBranchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [maxAmount, setMaxAmount] = useState("50");
  const [commissionType, setCommissionType] = useState<"FLAT" | "PERCENT">("FLAT");
  const [commission, setCommission] = useState("1");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const defaults = await api<SystemSettings>("/api/admin/system/settings");
        setMaxAmount(String(defaults.defaultMaxOperationAmount));
        setCommissionType(defaults.defaultCommissionType);
        setCommission(String(defaults.defaultCommissionValue));
      } catch {
        // Keep safe local defaults if general settings cannot be loaded.
      }
    })();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/admin/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          address: address || undefined,
          maxOperationAmount: Number(maxAmount),
          commissionType,
          commissionValue: Number(commission)
        })
      });
      onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear la filial"); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop"><form className="modal branch-create-modal" onSubmit={submit}>
    <div className="modal-head"><div><h2>Nueva filial</h2><p>Crea el punto de operación y deja lista su regla comercial.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="field-grid"><label>Código<input value={code} onChange={(e)=>setCode(e.target.value)} placeholder="Ej. TRU01" required /></label><label>Nombre<input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Ej. Trujillo Centro" required /></label></div>
    <label>Dirección<input value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="Opcional" /></label>
    <div className="field-grid">
      <label>Límite por operación<div className="input-prefix"><span>S/</span><input value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} inputMode="decimal" required /></div></label>
      <label>Tipo de comisión<select value={commissionType} onChange={(e)=>setCommissionType(e.target.value as "FLAT"|"PERCENT")}><option value="FLAT">Monto fijo</option><option value="PERCENT">Porcentaje</option></select></label>
    </div>
    <label>Comisión del encargado<div className="input-prefix"><span>{commissionType === "FLAT" ? "S/" : "%"}</span><input value={commission} onChange={(e)=>setCommission(e.target.value)} inputMode="decimal" required /></div></label>
    {error && <div className="modal-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Creando…" : "Crear filial"}</button></div>
  </form></div>;
}

function CreateUserModal({ branches, users, onClose, onCreated }: { branches: Branch[]; users: AdminUser[]; onClose: () => void; onCreated: () => void }) {
  const occupiedBranchIds = new Set(
    users.filter((item) => item.role_code==="CASHIER" && Boolean(item.active) && item.branch_id != null).map((item) => Number(item.branch_id))
  );
  const firstAvailable = branches.find((branch) => !occupiedBranchIds.has(branch.id));
  const [branchId, setBranchId] = useState(firstAvailable ? String(firstAvailable.id) : "");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleCode: "CASHIER",
          branchId: Number(branchId),
          fullName,
          username,
          password
        })
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el encargado");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><h2>Nuevo encargado</h2><p>Crea la cuenta responsable de una filial.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="field-grid">
      <label>Nombre completo<input value={fullName} onChange={(e)=>setFullName(e.target.value)} required /></label>
      <label>Nombre de la cuenta<input value={username} onChange={(e)=>setUsername(e.target.value)} required /></label>
    </div>
    <div className="field-grid">
      <label>Rol<select value="CASHIER" disabled><option value="CASHIER">Cajero / Encargado</option></select></label>
      <label>Filial<select value={branchId} onChange={(e)=>setBranchId(e.target.value)} required>
        <option value="">Selecciona una filial</option>
        {branches.map((branch)=><option key={branch.id} value={branch.id} disabled={occupiedBranchIds.has(branch.id)}>{branch.name}{occupiedBranchIds.has(branch.id)?" · ya tiene encargado":""}</option>)}
      </select></label>
    </div>
    <label>Contraseña<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Mín. 10 caracteres, mayúscula, minúscula y número" required /></label>
    {!firstAvailable && <div className="friendly-info"><UserCog size={16}/><span>Todas las filiales activas ya tienen un encargado.</span></div>}
    {error && <div className="modal-error">{error}</div>}
    <div className="modal-actions">
      <button type="button" className="ghost-button" onClick={onClose}>Cancelar</button>
      <button className="primary" disabled={saving || !branchId}>{saving ? "Creando…" : "Crear encargado"}</button>
    </div>
  </form></div>;
}

function BranchSettingsModal({ branch, onClose, onSaved }: { branch: Branch; onClose: () => void; onSaved: () => void }) {
  const [maxAmount, setMaxAmount] = useState(String(branch.settings.maxOperationAmount));
  const [commissionType, setCommissionType] = useState<"FLAT" | "PERCENT">(branch.settings.commissionType);
  const [commissionValue, setCommissionValue] = useState(String(branch.settings.commissionValue));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api(`/api/admin/branches/${branch.id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxOperationAmount: Number(maxAmount),
          commissionType,
          commissionValue: Number(commissionValue)
        })
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><h2>Configurar {branch.name}</h2><p>Límite y comisión de la filial.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="field-grid">
      <label>Límite por operación<div className="input-prefix"><span>S/</span><input value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} required /></div></label>
      <label>Tipo de comisión<select value={commissionType} onChange={(e)=>setCommissionType(e.target.value as "FLAT"|"PERCENT")}><option value="FLAT">Monto fijo</option><option value="PERCENT">Porcentaje</option></select></label>
    </div>
    <label>Comisión del encargado<div className="input-prefix"><span>{commissionType === "FLAT" ? "S/" : "%"}</span><input value={commissionValue} onChange={(e)=>setCommissionValue(e.target.value)} required /></div><small>La comisión generada pertenece al encargado de la filial.</small></label>
    {error && <div className="modal-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
  </form></div>;
}

function EditUserModal({
  user,
  branches,
  users,
  currentUserId,
  onClose,
  onSaved
}: {
  user: AdminUser;
  branches: Branch[];
  users: AdminUser[];
  currentUserId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isOwner = user.role_code === "OWNER";
  const isSelf = user.id === currentUserId;
  const occupiedBranchIds = new Set(
    users.filter((item)=>item.id!==user.id && item.role_code==="CASHIER" && Boolean(item.active) && item.branch_id!=null).map((item)=>Number(item.branch_id))
  );
  const [branchId, setBranchId] = useState(user.branch_id ? String(user.branch_id) : "");
  const [fullName, setFullName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username);
  const [active, setActive] = useState(Boolean(user.active));
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/admin/users/${user.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleCode: isOwner ? "OWNER" : "CASHIER",
          branchId: isOwner ? null : Number(branchId),
          fullName,
          username,
          active
        })
      });
      setMessage("Cuenta actualizada.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la cuenta");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      setNewPassword("");
      setMessage("Contraseña restablecida. Las sesiones anteriores fueron cerradas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={save}>
    <div className="modal-head"><div><h2>Editar cuenta</h2><p>{user.full_name} · @{user.username}</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="field-grid">
      <label>Nombre completo<input value={fullName} onChange={(e)=>setFullName(e.target.value)} required /></label>
      <label>Nombre de la cuenta<input value={username} onChange={(e)=>setUsername(e.target.value)} required /></label>
    </div>
    <div className="field-grid">
      <label>Rol<select value={isOwner?"OWNER":"CASHIER"} disabled><option value="OWNER">Propietario</option><option value="CASHIER">Cajero / Encargado</option></select></label>
      <label>Filial<select value={branchId} onChange={(e)=>setBranchId(e.target.value)} disabled={isOwner}>{isOwner ? <option value="">Acceso global</option> : branches.map((branch)=><option value={branch.id} key={branch.id} disabled={occupiedBranchIds.has(branch.id)}>{branch.name}{occupiedBranchIds.has(branch.id)?" · ya tiene encargado":""}</option>)}</select></label>
    </div>
    <label className="active-toggle"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)} disabled={isSelf} /> Cuenta activa</label>
    <div className="password-reset-box">
      <div><KeyRound size={17}/><div><strong>Restablecer contraseña</strong><span>Cierra las demás sesiones del usuario.</span></div></div>
      <div className="password-reset-row"><input type="password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} placeholder="Nueva contraseña segura" /><button type="button" className="soft" disabled={saving || !newPassword} onClick={() => void resetPassword()}>Restablecer</button></div>
    </div>
    {error && <div className="modal-error">{error}</div>}
    {message && <div className="success-message">{message}</div>}
    <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cerrar</button><button className="primary" disabled={saving || (!isOwner && !branchId)}>{saving ? "Guardando…" : "Guardar cuenta"}</button></div>
  </form></div>;
}

function BranchDetailModal({
  branchId,
  onClose,
  onChanged
}: {
  branchId: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<BranchDetail | null>(null);
  const [tab, setTab] = useState<"overview"|"operations"|"users"|"closures">("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [active, setActive] = useState(true);
  const [maxAmount, setMaxAmount] = useState("");
  const [commissionType, setCommissionType] = useState<"FLAT"|"PERCENT">("FLAT");
  const [commissionValue, setCommissionValue] = useState("");

  async function loadDetail() {
    setLoading(true); setError("");
    try {
      const data = await api<BranchDetail>(`/api/admin/branches/${branchId}/detail`);
      setDetail(data);
      setCode(data.branch.code);
      setName(data.branch.name);
      setAddress(data.branch.address ?? "");
      setActive(data.branch.active);
      setMaxAmount(String(data.branch.settings.maxOperationAmount));
      setCommissionType(data.branch.settings.commissionType);
      setCommissionValue(String(data.branch.settings.commissionValue));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la filial");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDetail(); }, [branchId]);

  async function saveBranch(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/admin/branches/${branchId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, address: address || null, active })
      });
      await api(`/api/admin/branches/${branchId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxOperationAmount: Number(maxAmount),
          commissionType,
          commissionValue: Number(commissionValue)
        })
      });
      setMessage("Filial actualizada correctamente.");
      await Promise.all([loadDetail(), onChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la filial");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop branch-detail-backdrop">
    <div className="branch-detail-modal">
      <div className="branch-detail-header">
        <div>
          <div className="branch-detail-title"><div className="branch-monogram big">{detail?.branch.code.slice(0,2) ?? "--"}</div><div><h2>{detail?.branch.name ?? "Filial"}</h2><span>{detail?.branch.code ?? ""} · {detail?.branch.active ? "Activa" : "Inactiva"}</span></div></div>
          <p>{detail?.branch.address ?? "Sin dirección registrada"}</p>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={19}/></button>
      </div>

      <div className="branch-detail-tabs">
        <button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>Resumen</button>
        <button className={tab==="operations"?"active":""} onClick={()=>setTab("operations")}>Operaciones</button>
        <button className={tab==="users"?"active":""} onClick={()=>setTab("users")}>Usuarios</button>
        <button className={tab==="closures"?"active":""} onClick={()=>setTab("closures")}>Cierres</button>
      </div>

      {loading && <div className="branch-detail-loading">Cargando filial…</div>}
      {error && <div className="modal-error branch-detail-error">{error}</div>}

      {!loading && detail && tab==="overview" && <div className="branch-detail-body">
        <div className="branch-detail-kpis">
          <div><span>Operaciones hoy</span><strong>{detail.today.operations}</strong></div>
          <div><span>Monto movilizado hoy</span><strong>{currency(detail.today.amount)}</strong></div>
          <div><span>Comisión hoy</span><strong>{currency(detail.today.commission)}</strong></div>
          <div><span>Usuarios asignados</span><strong>{detail.users.length}</strong></div>
          <div><span>Estado de caja</span><strong className={detail.cashSessions[0]?.status==="OPEN"?"green-text":"red-text"}>{detail.cashSessions[0]?.status==="OPEN"?"ABIERTA":"CERRADA"}</strong></div>
        </div>

        <form className="branch-detail-form card" onSubmit={saveBranch}>
          <div className="card-head"><div><strong>Datos y configuración</strong><span>Edita la filial sin salir de su ficha</span></div><Pencil size={16}/></div>
          <div className="branch-form-content">
            <div className="field-grid"><label>Código<input value={code} onChange={(e)=>setCode(e.target.value)} required /></label><label>Nombre<input value={name} onChange={(e)=>setName(e.target.value)} required /></label></div>
            <label>Dirección<input value={address} onChange={(e)=>setAddress(e.target.value)} /></label>
            <label className="active-toggle"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)} /> Filial activa</label>
            <div className="section-divider">Regla de operación</div>
            <div className="field-grid"><label>Límite por operación<div className="input-prefix"><span>S/</span><input value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} required /></div></label><label>Tipo de comisión<select value={commissionType} onChange={(e)=>setCommissionType(e.target.value as "FLAT"|"PERCENT")}><option value="FLAT">Monto fijo</option><option value="PERCENT">Porcentaje</option></select></label></div>
            <label>Comisión del encargado<div className="input-prefix"><span>{commissionType==="FLAT"?"S/":"%"}</span><input value={commissionValue} onChange={(e)=>setCommissionValue(e.target.value)} required /></div></label>
            <div className="friendly-info"><UserCog size={16}/><span>Esta comisión pertenece al encargado asignado a la filial.</span></div>
            {message && <div className="success-message">{message}</div>}
            <div className="modal-actions"><button className="primary" disabled={saving}>{saving?"Guardando…":"Guardar cambios"}</button></div>
          </div>
        </form>

        <section className="card branch-live-card">
          <div className="card-head"><div><strong>Turnos de caja recientes</strong><span>Últimos {detail.cashSessions.length}</span></div></div>
          <div className="branch-mini-list">
            {detail.cashSessions.slice(0,5).map((item)=><div key={item.id}><span className={item.status==="OPEN"?"branch-status open":"branch-status closed"}>{item.status==="OPEN"?"ABIERTA":"CERRADA"}</span><div><strong>{dateTime(item.started_at)}</strong><span>Inicial: {currency(item.initial_cash)} efectivo · {currency(item.initial_wallet)} Yape</span></div></div>)}
            {!detail.cashSessions.length && <div className="empty-cell">Sin turnos.</div>}
          </div>
        </section>
      </div>}

      {!loading && detail && tab==="operations" && <div className="branch-detail-table"><div className="table-wrap"><table className="admin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cliente</th><th>Referencia</th><th>Monto</th><th>Comisión</th><th>Entregado</th><th>Registró</th><th>Estado</th></tr></thead><tbody>
        {detail.recentOperations.map((op)=><tr key={op.id}><td>{dateTime(op.created_at)}</td><td><span className={`type-pill ${op.operation_type==="YAPE_TO_CASH"?"yape":"cash"}`}>{op.operation_type==="YAPE_TO_CASH"?"Yape → Efectivo":"Efectivo → Yape"}</span></td><td>{op.customer_name??"—"}</td><td>{op.reference_code??"—"}</td><td>{currency(op.amount)}</td><td>{currency(op.commission)}</td><td>{currency(op.net_amount)}</td><td>{op.registered_by??"—"}</td><td><span className={`status ${op.status==="COMPLETED"?"ok":"pending"}`}><i />{op.status==="COMPLETED"?"Completada":op.status==="IN_PROGRESS"?"En proceso":op.status==="CANCELLED"?"Anulada":op.status==="REVERSED"?"Revertida":op.status}</span></td></tr>)}
        {!detail.recentOperations.length && <tr><td colSpan={9} className="empty-cell">Sin operaciones.</td></tr>}
      </tbody></table></div></div>}

      {!loading && detail && tab==="users" && <div className="branch-detail-table"><div className="table-wrap"><table className="admin-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Último acceso</th><th>Estado</th></tr></thead><tbody>
        {detail.users.map((item)=><tr key={item.id}><td><strong>{item.full_name}</strong></td><td>{item.username}</td><td>{item.role_name}</td><td>{dateTime(item.last_login_at)}</td><td><span className={item.active?"branch-status open":"branch-status closed"}>{item.active?"Activo":"Inactivo"}</span></td></tr>)}
        {!detail.users.length && <tr><td colSpan={5} className="empty-cell">No hay usuarios asignados.</td></tr>}
      </tbody></table></div></div>}

      {!loading && detail && tab==="closures" && <div className="branch-detail-table"><div className="table-wrap"><table className="admin-table"><thead><tr><th>Fecha</th><th>Resultado</th><th>Operaciones</th><th>Comisión</th><th>Diferencias</th><th>PDF</th></tr></thead><tbody>
        {detail.closures.map((item)=><tr key={item.id}><td>{dateTime(item.closed_at)}</td><td><span className={`branch-status ${closureResult(item as Closure).cls}`}>{closureResult(item as Closure).label}</span></td><td>{item.operation_count ?? 0}</td><td><strong>{currency(item.commission_total)}</strong><br/><small>Ganancia del encargado</small></td><td><span className={Math.abs(Number(item.difference_cash))<0.005?"green-text":"red-text"}>Efectivo {currency(item.difference_cash)}</span><br/><span className={Math.abs(Number(item.difference_wallet))<0.005?"green-text":"red-text"}>Yape {currency(item.difference_wallet)}</span></td><td><button className="mini-button" onClick={()=>window.open(`/api/branches/${detail.branch.id}/closures/${item.id}/pdf`,"_blank")}><Download size={12}/> PDF</button></td></tr>)}
        {!detail.closures.length && <tr><td colSpan={6} className="empty-cell">Todavía no hay cierres.</td></tr>}
      </tbody></table></div></div>}
    </div>
  </div>;
}
