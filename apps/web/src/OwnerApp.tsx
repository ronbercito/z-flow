import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileSearch,
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
  | "partners"
  | "commissions"
  | "reports"
  | "audit"
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
  net_amount: number;
  status: string;
  created_at: string;
  branch_id: number;
  branch_name: string;
  registered_by: string | null;
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

type Closure = {
  id: number;
  expected_cash: number;
  declared_cash: number;
  expected_wallet: number;
  declared_wallet: number;
  difference_cash: number;
  difference_wallet: number;
  notes: string | null;
  closed_at: string;
  branch_id: number;
  branch_name: string;
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
    net_amount: number;
    status: string;
    created_at: string;
    registered_by: string | null;
  }>;
  closures: Array<{
    id: number;
    expected_cash: number;
    declared_cash: number;
    expected_wallet: number;
    declared_wallet: number;
    difference_cash: number;
    difference_wallet: number;
    notes: string | null;
    closed_at: string;
  }>;
};

const nav: Array<{ page: AdminPage; label: string; icon: typeof Home }> = [
  { page: "dashboard", label: "Dashboard", icon: Home },
  { page: "branches", label: "Filiales", icon: Building2 },
  { page: "operations", label: "Operaciones", icon: ReceiptText },
  { page: "cash", label: "Cajas / Cierres", icon: WalletCards },
  { page: "users", label: "Usuarios", icon: Users },
  { page: "partners", label: "Socios", icon: Landmark },
  { page: "commissions", label: "Comisiones", icon: CircleDollarSign },
  { page: "reports", label: "Reportes", icon: BarChart3 },
  { page: "audit", label: "Auditoría", icon: FileSearch },
  { page: "profile", label: "Mi perfil", icon: UserRound }
];

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

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "No se pudo completar la solicitud");
  return result as T;
}

export default function OwnerApp({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> | void }) {
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
    partners: ["Socios", "Usuarios con rol de socio y su alcance"],
    commissions: ["Comisiones", "Reglas de cobro y reparto por filial"],
    reports: ["Reportes", "Consolidado operativo y financiero"],
    audit: ["Auditoría", "Historial de acciones sensibles dentro de Z-FLOW"],
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
          <div><strong>Z-FLOW</strong><span>Panel propietario</span></div>
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
          <div className="page-title-row">
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
              {(page === "users" || page === "partners") && <button className="primary" onClick={() => setUserModal(true)}><Plus size={17} /> Nuevo usuario</button>}
            </div>
          </div>

          {error && <div className="error-banner">{error}<button onClick={() => void refreshAll()}><RefreshCw size={14} /> Reintentar</button></div>}
          {loading && !overview ? <div className="owner-loading">Cargando información global…</div> : null}

          {page === "dashboard" && overview && <OwnerDashboard overview={overview} onPage={go} onSettings={setSettingsBranch} />}
          {page === "branches" && overview && <BranchesPage branches={overview.branches} onSettings={setSettingsBranch} onDetail={(branch) => setDetailBranchId(branch.id)} />}
          {page === "operations" && <GlobalOperationsPage operations={operations} branches={overview?.branches ?? []} />}
          {page === "cash" && <CashAdminPage branches={overview?.branches ?? []} closures={closures} />}
          {page === "users" && <UsersPage users={users} branches={overview?.branches ?? []} onRefresh={refreshAll} onEdit={setEditingUser} />}
          {page === "partners" && <PartnersPage users={users} />}
          {page === "commissions" && overview && <CommissionsPage branches={overview.branches} onSettings={setSettingsBranch} />}
          {page === "reports" && overview && <AdminReports overview={overview} operations={operations} closures={closures} />}
          {page === "audit" && <AuditPage rows={auditRows} />}
          {page === "profile" && <OwnerProfile user={user} />}
        </section>
      </main>

      {branchModal && <CreateBranchModal onClose={() => setBranchModal(false)} onCreated={async () => { setBranchModal(false); await refreshAll(); }} />}
      {userModal && <CreateUserModal branches={overview?.branches ?? []} onClose={() => setUserModal(false)} onCreated={async () => { setUserModal(false); await refreshAll(); }} />}
      {settingsBranch && <BranchSettingsModal branch={settingsBranch} onClose={() => setSettingsBranch(null)} onSaved={async () => { setSettingsBranch(null); await refreshAll(); }} />}
      {detailBranchId && <BranchDetailModal branchId={detailBranchId} onClose={() => setDetailBranchId(null)} onChanged={refreshAll} />}
      {editingUser && <EditUserModal user={editingUser} branches={overview?.branches ?? []} currentUserId={user.id} onClose={() => setEditingUser(null)} onSaved={async () => { setEditingUser(null); await refreshAll(); }} />}
    </div>
  );
}

function OwnerDashboard({ overview, onPage, onSettings }: { overview: Overview; onPage: (page: AdminPage) => void; onSettings: (branch: Branch) => void }) {
  const maxOps = Math.max(...overview.branches.map((branch) => branch.operationsToday), 1);
  return (
    <>
      <div className="owner-kpis">
        <OwnerKpi icon={<Building2 />} tone="blue" label="Filiales activas" value={String(overview.metrics.activeBranches)} />
        <OwnerKpi icon={<ReceiptText />} tone="purple" label="Operaciones hoy" value={String(overview.metrics.operationsToday)} />
        <OwnerKpi icon={<SmartValue />} tone="violet" label="Yape recibido" value={currency(overview.metrics.yapeReceived)} />
        <OwnerKpi icon={<WalletCards />} tone="green" label="Efectivo entregado" value={currency(overview.metrics.cashDelivered)} />
        <OwnerKpi icon={<BadgeDollarSign />} tone="orange" label="Comisión hoy" value={currency(overview.metrics.commissionToday)} />
        <OwnerKpi icon={<Users />} tone="cyan" label="Usuarios activos" value={String(overview.metrics.activeUsers)} />
        <OwnerKpi icon={<WalletCards />} tone="blue" label="Cajas abiertas" value={String(overview.metrics.openCashSessions)} />
      </div>

      <div className="owner-dashboard-grid">
        <section className="card owner-branches-card">
          <div className="card-head">
            <div><strong>Rendimiento por filial</strong><span>Operaciones registradas hoy</span></div>
            <button className="ghost" onClick={() => onPage("branches")}>Ver filiales</button>
          </div>
          <div className="branch-performance">
            {overview.branches.map((branch) => (
              <div className="branch-performance-row" key={branch.id}>
                <div className="branch-monogram">{branch.code.slice(0, 2)}</div>
                <div className="branch-performance-main">
                  <div><strong>{branch.name}</strong><span>{branch.operationsToday} operaciones · {currency(branch.commissionToday)} comisión</span></div>
                  <div className="branch-progress"><i style={{ width: `${Math.max(4, (branch.operationsToday / maxOps) * 100)}%` }} /></div>
                </div>
                <span className={branch.cashOpen ? "branch-status open" : "branch-status closed"}>{branch.cashOpen ? "Caja abierta" : "Caja cerrada"}</span>
                <button className="mini-button" onClick={() => onSettings(branch)}><Settings2 size={13} /> Configurar</button>
              </div>
            ))}
          </div>
        </section>

        <section className="card owner-summary-card">
          <div className="card-head"><div><strong>Estado general</strong><span>Hoy</span></div></div>
          <div className="owner-summary-list">
            <SummaryLine label="Filiales operando" value={String(overview.branches.filter((b) => b.cashOpen).length)} />
            <SummaryLine label="Filiales con caja cerrada" value={String(overview.branches.filter((b) => !b.cashOpen).length)} />
            <SummaryLine label="Comisión consolidada" value={currency(overview.metrics.commissionToday)} />
            <SummaryLine label="Operaciones del día" value={String(overview.metrics.operationsToday)} />
          </div>
          <button className="primary full owner-report-button" onClick={() => onPage("reports")}><BarChart3 size={16} /> Abrir reportes</button>
        </section>
      </div>

      <section className="card page-card">
        <div className="card-head"><div><strong>Últimas operaciones</strong><span>Todas las filiales</span></div><button className="ghost" onClick={() => onPage("operations")}>Ver todas</button></div>
        <GlobalOperationsTable operations={overview.recentOperations} />
      </section>
    </>
  );
}

function SmartValue() {
  return <Activity />;
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

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="owner-summary-line"><span>{label}</span><strong>{value}</strong></div>;
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

function GlobalOperationsPage({ operations, branches }: { operations: GlobalOperation[]; branches: Branch[] }) {
  const [branch, setBranch] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
      <GlobalOperationsTable operations={filtered} />
    </section>
  );
}

function GlobalOperationsTable({ operations }: { operations: GlobalOperation[] }) {
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead><tr><th>Fecha / Hora</th><th>Filial</th><th>Tipo</th><th>Cliente</th><th>Referencia</th><th>Monto</th><th>Comisión</th><th>Entregado</th><th>Registró</th><th>Estado</th></tr></thead>
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
              <td><span className={`status ${op.status === "COMPLETED" ? "ok" : "pending"}`}><i />{op.status === "COMPLETED" ? "Completada" : op.status}</span></td>
            </tr>
          ))}
          {!operations.length && <tr><td colSpan={10} className="empty-cell">No hay operaciones.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CashAdminPage({ branches, closures }: { branches: Branch[]; closures: Closure[] }) {
  const [branch, setBranch] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filteredClosures = closures.filter((item) => {
    const day = item.closed_at.slice(0, 10);
    return (branch === "ALL" || String(item.branch_id) === branch)
      && (!from || day >= from)
      && (!to || day <= to);
  });

  return (
    <>
      <div className="branch-cash-grid">
        {branches.map((item) => (
          <section className="card branch-cash-card" key={item.id}>
            <div><div className="branch-monogram">{item.code.slice(0,2)}</div><div><strong>{item.name}</strong><span>{item.address ?? "Sin dirección"}</span></div></div>
            <span className={item.cashOpen ? "branch-status open" : "branch-status closed"}>{item.cashOpen ? "ABIERTA" : "CERRADA"}</span>
          </section>
        ))}
      </div>
      <section className="card page-card">
        <div className="card-head admin-filter-head">
          <div><strong>Historial de cierres</strong><span>{filteredClosures.length} cierres encontrados</span></div>
          <div className="admin-filters admin-filters-wide">
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="ALL">Todas las filiales</option>
              {branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <label className="date-filter"><span>Desde</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="date-filter"><span>Hasta</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button className="filter-clear" onClick={() => { setBranch("ALL"); setFrom(""); setTo(""); }}>Limpiar</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Fecha</th><th>Filial</th><th>Caja esperada</th><th>Caja declarada</th><th>Diferencia caja</th><th>Yape esperado</th><th>Yape declarado</th><th>Diferencia Yape</th></tr></thead>
            <tbody>
              {filteredClosures.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.closed_at)}</td><td><strong>{item.branch_name}</strong></td>
                  <td>{currency(item.expected_cash)}</td><td>{currency(item.declared_cash)}</td>
                  <td className={Number(item.difference_cash) === 0 ? "green-text" : "red-text"}>{currency(item.difference_cash)}</td>
                  <td>{currency(item.expected_wallet)}</td><td>{currency(item.declared_wallet)}</td>
                  <td className={Number(item.difference_wallet) === 0 ? "green-text" : "red-text"}>{currency(item.difference_wallet)}</td>
                </tr>
              ))}
              {!filteredClosures.length && <tr><td colSpan={8} className="empty-cell">No hay cierres para esos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function UsersPage({ users, branches, onRefresh, onEdit }: { users: AdminUser[]; branches: Branch[]; onRefresh: () => Promise<void>; onEdit: (user: AdminUser) => void }) {
  async function toggle(user: AdminUser) {
    await api(`/api/admin/users/${user.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !Boolean(user.active) })
    });
    await onRefresh();
  }

  return (
    <section className="card page-card">
      <div className="card-head"><div><strong>Usuarios del sistema</strong><span>{users.length} cuentas registradas · {branches.length} filiales</span></div></div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Filial</th><th>Último acceso</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {users.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.full_name}</strong></td><td>{item.username}</td><td>{item.role_name}</td><td>{item.branch_name ?? "Global"}</td><td>{dateTime(item.last_login_at)}</td>
                <td><span className={item.active ? "branch-status open" : "branch-status closed"}>{item.active ? "Activo" : "Inactivo"}</span></td>
                <td><div className="inline-actions"><button className="mini-button" onClick={() => onEdit(item)}><Pencil size={12} /> Editar</button><button className={item.active ? "mini-button danger-mini" : "mini-button"} onClick={() => void toggle(item)}>{item.active ? "Desactivar" : "Activar"}</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PartnersPage({ users }: { users: AdminUser[] }) {
  const partners = users.filter((item) => item.role_code === "PARTNER");
  return (
    <section className="card page-card">
      <div className="card-head"><div><strong>Socios</strong><span>{partners.length} usuarios con rol socio</span></div></div>
      <div className="partner-grid">
        {partners.map((item) => (
          <div className="partner-card" key={item.id}>
            <div className="avatar">{item.full_name.split(/\s+/).slice(0,2).map((x) => x[0]).join("")}</div>
            <div><strong>{item.full_name}</strong><span>@{item.username}</span><small>{item.branch_name ?? "Acceso global de lectura"}</small></div>
          </div>
        ))}
        {!partners.length && <div className="empty-state compact-empty"><Landmark size={28} /><strong>Aún no hay socios creados</strong><span>Usa “Nuevo usuario” y asigna el rol Socio.</span></div>}
      </div>
    </section>
  );
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
              <div className="share-line"><span>Encargado: {branch.settings.staffSharePct ?? "—"}%</span><span>Socio: {branch.settings.partnerSharePct ?? "—"}%</span></div>
            </div>
            <button className="mini-button" onClick={() => onSettings(branch)}><Settings2 size={13} /> Editar</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminReports({ overview, operations, closures }: { overview: Overview; operations: GlobalOperation[]; closures: Closure[] }) {
  const totalMoved = operations.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalCommission = operations.reduce((sum, item) => sum + Number(item.commission), 0);
  const differences = closures.reduce((sum, item) => sum + Math.abs(Number(item.difference_cash)) + Math.abs(Number(item.difference_wallet)), 0);

  return (
    <>
      <div className="owner-kpis reports-owner-kpis">
        <OwnerKpi icon={<ReceiptText />} tone="blue" label="Operaciones cargadas" value={String(operations.length)} />
        <OwnerKpi icon={<BadgeDollarSign />} tone="green" label="Monto movilizado" value={currency(totalMoved)} />
        <OwnerKpi icon={<CircleDollarSign />} tone="orange" label="Comisión acumulada" value={currency(totalCommission)} />
        <OwnerKpi icon={<ScaleIcon />} tone="purple" label="Diferencias cierres" value={currency(differences)} />
        <OwnerKpi icon={<Building2 />} tone="cyan" label="Filiales activas" value={String(overview.metrics.activeBranches)} />
      </div>
      <section className="card page-card">
        <div className="card-head"><div><strong>Comparativo por filial</strong><span>Actividad de hoy</span></div></div>
        <div className="report-bars owner-report-bars">
          {overview.branches.map((branch) => (
            <div className="report-bar-row" key={branch.id}>
              <div><strong>{branch.name}</strong><span>{branch.operationsToday} operaciones · {currency(branch.commissionToday)}</span></div>
              <div className="progress"><i className="purple" style={{ width: `${Math.max(3, (branch.operationsToday / Math.max(...overview.branches.map((x) => x.operationsToday), 1)) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ScaleIcon() {
  return <ClipboardCheck />;
}

function AuditPage({ rows }: { rows: AuditRow[] }) {
  return (
    <section className="card page-card">
      <div className="card-head"><div><strong>Bitácora de seguridad</strong><span>{rows.length} eventos recientes</span></div></div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Fecha / Hora</th><th>Usuario</th><th>Filial</th><th>Acción</th><th>Entidad</th><th>ID</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td>{dateTime(row.created_at)}</td><td><strong>{row.user_name ?? "Sistema"}</strong><br/><small>{row.username ?? ""}</small></td><td>{row.branch_name ?? "Global"}</td><td><span className="audit-action">{row.action}</span></td><td>{row.entity_type ?? "—"}</td><td>{row.entity_id ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OwnerProfile({ user }: { user: AuthUser }) {
  return (
    <div className="detail-grid">
      <section className="card large-panel">
        <div className="profile-head"><div className="avatar big">{user.fullName.split(/\s+/).slice(0,2).map((x) => x[0]).join("")}</div><div><h2>{user.fullName}</h2><p>{user.role.name}</p></div></div>
        <div className="profile-details">
          <div><span>Usuario</span><strong>{user.username}</strong></div>
          <div><span>Alcance</span><strong>Global</strong></div>
          <div><span>Rol</span><strong>{user.role.name}</strong></div>
          <div><span>Último acceso</span><strong>{dateTime(user.lastLoginAt)}</strong></div>
        </div>
      </section>
      <section className="card action-panel"><ShieldCheck size={28} /><h3>Cuenta propietaria</h3><p>Puede administrar filiales, usuarios, comisiones y consultar información global.</p></section>
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
  const [staffShare, setStaffShare] = useState("");
  const [partnerShare, setPartnerShare] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
          commissionValue: Number(commission),
          staffSharePct: staffShare === "" ? null : Number(staffShare),
          partnerSharePct: partnerShare === "" ? null : Number(partnerShare)
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
    <label>Valor de comisión<div className="input-prefix"><span>{commissionType === "FLAT" ? "S/" : "%"}</span><input value={commission} onChange={(e)=>setCommission(e.target.value)} inputMode="decimal" required /></div></label>
    <div className="field-grid"><label>% Encargado<input value={staffShare} onChange={(e)=>setStaffShare(e.target.value)} placeholder="Ej. 30" /></label><label>% Socio<input value={partnerShare} onChange={(e)=>setPartnerShare(e.target.value)} placeholder="Ej. 70" /></label></div>
    <small>El reparto es opcional al crear. Si completas ambos porcentajes deben sumar 100%.</small>
    {error && <div className="modal-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Creando…" : "Crear filial"}</button></div>
  </form></div>;
}

function CreateUserModal({ branches, onClose, onCreated }: { branches: Branch[]; onClose: () => void; onCreated: () => void }) {
  const [role, setRole] = useState("CASHIER");
  const [branchId, setBranchId] = useState(branches[0] ? String(branches[0].id) : "");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const needsBranch = ["CASHIER", "BRANCH_ADMIN"].includes(role);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleCode: role,
          branchId: needsBranch ? Number(branchId) : null,
          fullName,
          username,
          password
        })
      });
      onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el usuario"); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><h2>Nuevo usuario</h2><p>Asigna rol, filial y credenciales.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="field-grid"><label>Nombre completo<input value={fullName} onChange={(e)=>setFullName(e.target.value)} required /></label><label>Usuario<input value={username} onChange={(e)=>setUsername(e.target.value)} required /></label></div>
    <div className="field-grid"><label>Rol<select value={role} onChange={(e)=>setRole(e.target.value)}><option value="CASHIER">Cajero / Encargado</option><option value="BRANCH_ADMIN">Administrador de filial</option><option value="PARTNER">Socio</option><option value="AUDITOR">Auditor</option><option value="OWNER">Propietario</option></select></label><label>Filial<select value={branchId} onChange={(e)=>setBranchId(e.target.value)} disabled={!needsBranch}>{needsBranch ? branches.map((b)=><option value={b.id} key={b.id}>{b.name}</option>) : <option value="">Acceso global</option>}</select></label></div>
    <label>Contraseña temporal<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Mín. 10 caracteres, mayúscula, minúscula y número" required /></label>
    {error && <div className="modal-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Creando…" : "Crear usuario"}</button></div>
  </form></div>;
}

function BranchSettingsModal({ branch, onClose, onSaved }: { branch: Branch; onClose: () => void; onSaved: () => void }) {
  const [maxAmount, setMaxAmount] = useState(String(branch.settings.maxOperationAmount));
  const [commissionType, setCommissionType] = useState<"FLAT" | "PERCENT">(branch.settings.commissionType);
  const [commissionValue, setCommissionValue] = useState(String(branch.settings.commissionValue));
  const [staffShare, setStaffShare] = useState(branch.settings.staffSharePct == null ? "" : String(branch.settings.staffSharePct));
  const [partnerShare, setPartnerShare] = useState(branch.settings.partnerSharePct == null ? "" : String(branch.settings.partnerSharePct));
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
          commissionValue: Number(commissionValue),
          staffSharePct: staffShare === "" ? null : Number(staffShare),
          partnerSharePct: partnerShare === "" ? null : Number(partnerShare)
        })
      });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar"); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><h2>Configurar {branch.name}</h2><p>Reglas de operación, comisión y reparto.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="field-grid"><label>Límite por operación<div className="input-prefix"><span>S/</span><input value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} required /></div></label><label>Tipo de comisión<select value={commissionType} onChange={(e)=>setCommissionType(e.target.value as "FLAT"|"PERCENT")}><option value="FLAT">Monto fijo</option><option value="PERCENT">Porcentaje</option></select></label></div>
    <label>Valor de comisión<div className="input-prefix"><span>{commissionType === "FLAT" ? "S/" : "%"}</span><input value={commissionValue} onChange={(e)=>setCommissionValue(e.target.value)} required /></div></label>
    <div className="field-grid"><label>% Encargado<input value={staffShare} onChange={(e)=>setStaffShare(e.target.value)} placeholder="Ej. 30" /></label><label>% Socio<input value={partnerShare} onChange={(e)=>setPartnerShare(e.target.value)} placeholder="Ej. 70" /></label></div>
    <small>Si defines ambos porcentajes, deben sumar 100%.</small>
    {error && <div className="modal-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
  </form></div>;
}
