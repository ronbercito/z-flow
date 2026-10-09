import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import OwnerApp from "./OwnerApp";
import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Download,
  Home,
  LockKeyhole,
  LogOut,
  Menu,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Scale,
  Send,
  Settings2,
  Smartphone,
  UserRound,
  WalletCards,
  X
} from "lucide-react";

type Page = "home" | "operations" | "cash" | "close" | "receipts" | "reports" | "profile" | "help";

type Operation = {
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
  receipt_series?: string | null;
  receipt_number?: number | null;
};

type Dashboard = {
  branch: {
    id: number;
    code: string;
    name: string;
    address: string | null;
    active: number;
  };
  session: {
    id: number;
    user_id?: number | null;
    initial_cash: number;
    initial_wallet: number;
    status: string;
    started_at: string;
  } | null;
  metrics: {
    operationsToday: number;
    yapeReceived: number;
    cashDelivered: number;
    commissionTotal: number;
    sessionCommissionTotal: number;
    cashCurrent: number;
    walletCurrent: number;
    cashDifference: number;
  };
  recentOperations: Operation[];
};

type Settings = {
  max_operation_amount: number;
  commission_type: "FLAT" | "PERCENT";
  commission_value: number;
  staff_share_pct?: number | null;
  partner_share_pct?: number | null;
  require_cash_to_yape_reference?: number | boolean;
  allow_cashier_cancel?: number | boolean;
};

type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  role: { code: "OWNER" | "PARTNER" | "BRANCH_ADMIN" | "CASHIER" | "AUDITOR"; name: string };
  permissions: string[];
  branch: { id: number; code: string; name: string; address: string | null } | null;
  defaultBranch: { id: number; code: string; name: string; address: string | null } | null;
  lastLoginAt: string | null;
};

type BranchFinancialReport = {
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
};

type ClosurePreview = {
  sessionId: number;
  assignedUserId: number | null;
  assignedTo: string | null;
  startedAt: string;
  initialCash: number;
  initialWallet: number;
  operationCount: number;
  commissionTotal: number;
  staffShareTotal: number;
  partnerShareTotal: number;
  unassignedCommission: number;
  yapeReceived: number;
  cashDelivered: number;
  cashReceived: number;
  yapeSent: number;
  expectedCash: number;
  expectedWallet: number;
};

const sidebar: Array<{ page: Page; label: string; icon: typeof Home }> = [
  { page: "home", label: "Inicio", icon: Home },
  { page: "operations", label: "Operaciones", icon: ReceiptText },
  { page: "cash", label: "Caja", icon: WalletCards },
  { page: "close", label: "Cierre diario", icon: ClipboardCheck },
  { page: "receipts", label: "Comprobantes", icon: FileText },
  { page: "reports", label: "Reportes", icon: BarChart3 },
  { page: "profile", label: "Mi perfil", icon: UserRound },
  { page: "help", label: "Ayuda", icon: CircleHelp }
];

const demoHours = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"];

function currency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2
  }).format(Number(value ?? 0));
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function operationStatusLabel(status: string) {
  if (status === "COMPLETED") return "Completada";
  if (status === "IN_PROGRESS") return "En proceso";
  if (status === "CANCELLED") return "Anulada";
  if (status === "REVERSED") return "Revertida";
  return status;
}

function operationStatusClass(status: string) {
  if (status === "COMPLETED") return "ok";
  if (status === "CANCELLED") return "cancelled";
  if (status === "REVERSED") return "reversed";
  return "pending";
}

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [businessName, setBusinessName] = useState("Z-FLOW");
  const [page, setPage] = useState<Page>("home");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [operationModal, setOperationModal] = useState<null | "YAPE_TO_CASH" | "CASH_TO_YAPE">(null);
  const [openCashModal, setOpenCashModal] = useState(false);
  const [closeCashModal, setCloseCashModal] = useState(false);
  const [receipt, setReceipt] = useState<Operation | null>(null);

  const branchId = authUser?.branch?.id ?? authUser?.defaultBranch?.id ?? null;
  const canWrite = Boolean(authUser?.permissions.includes("BRANCH_WRITE") || authUser?.permissions.includes("GLOBAL_WRITE"));
  const visibleSidebar = canWrite
    ? sidebar
    : sidebar.filter((item) => !["cash", "close"].includes(item.page));

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!response.ok) {
        setAuthUser(null);
        return;
      }
      const result = await response.json();
      setAuthUser(result.user ?? null);
    } catch {
      setAuthUser(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    setAuthUser(null);
    setDashboard(null);
    setSettings(null);
    setOperations([]);
    setPage("home");
  }

  async function load() {
    if (!branchId) return;
    setLoading(true);
    setApiError("");
    try {
      const [dashboardRes, settingsRes, operationsRes] = await Promise.all([
        fetch(`/api/branches/${branchId}/dashboard`, { credentials: "same-origin" }),
        fetch(`/api/branches/${branchId}/settings`, { credentials: "same-origin" }),
        fetch(`/api/branches/${branchId}/operations`, { credentials: "same-origin" })
      ]);

      if ([dashboardRes, settingsRes, operationsRes].some((response) => response.status === 401)) {
        setAuthUser(null);
        setDashboard(null);
        return;
      }

      if (!dashboardRes.ok || !settingsRes.ok || !operationsRes.ok) {
        throw new Error("No se pudo obtener la información de la filial");
      }

      setDashboard(await dashboardRes.json());
      setSettings(await settingsRes.json());
      const all = await operationsRes.json();
      setOperations(all.operations ?? []);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkAuth();
    const loadBranding = async () => {
      try {
        const response = await fetch("/api/branding", { credentials: "same-origin" });
        if (!response.ok) return;
        const result = await response.json();
        if (typeof result.businessName === "string" && result.businessName.trim()) setBusinessName(result.businessName.trim());
      } catch { /* Keep the default label if branding is temporarily unavailable. */ }
    };
    const refreshBranding = () => { void loadBranding(); };
    void loadBranding();
    window.addEventListener("zflow:branding-updated", refreshBranding);
    return () => window.removeEventListener("zflow:branding-updated", refreshBranding);
  }, []);

  useEffect(() => { document.title = businessName; }, [businessName]);

  useEffect(() => {
    if (authUser && authUser.role.code !== "OWNER" && branchId) void load();
  }, [authUser?.id, authUser?.role.code, branchId]);

  const hourlyData = useMemo(() => {
    const count: Record<string, number> = Object.fromEntries(demoHours.map((hour) => [hour, 0]));
    for (const op of operations) {
      const date = new Date(op.created_at);
      const hour = String(date.getHours()).padStart(2, "0");
      if (hour in count && date.toDateString() === new Date().toDateString()) count[hour] += 1;
    }
    const max = Math.max(...Object.values(count), 1);
    return demoHours.map((hour) => ({
      hour,
      value: count[hour],
      height: Math.max(12, (count[hour] / max) * 100)
    }));
  }, [operations]);

  function navigate(next: Page) {
    setPage(next);
    setMobileNav(false);
  }

  if (!authChecked) {
    return <div className="splash">Verificando sesión de {businessName}…</div>;
  }

  if (!authUser) {
    return <LoginScreen businessName={businessName} onLogin={(user) => setAuthUser(user)} />;
  }

  if (authUser.role.code === "OWNER") {
    return <OwnerApp user={authUser} onLogout={logout} businessName={businessName} />;
  }

  if (!branchId) {
    return (
      <div className="splash">
        Tu usuario no tiene una filial disponible. Contacta al administrador.
        <button className="ghost-button" onClick={() => void logout()}>Cerrar sesión</button>
      </div>
    );
  }

  if (loading && !dashboard) {
    return <div className="splash">Cargando {businessName}…</div>;
  }

  const branchName = dashboard?.branch.name ?? authUser.branch?.name ?? authUser.defaultBranch?.name ?? "Filial";
  const initials = authUser.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const pageMeta: Record<Page, [string, string]> = {
    home: [`Panel de filial - ${branchName}`, "Resumen operativo del día"],
    operations: ["Operaciones", "Registra y consulta movimientos de esta filial"],
    cash: ["Caja", "Control del efectivo y saldo digital del turno"],
    close: ["Cierre diario", "Compara lo esperado contra lo declarado y cierra el turno"],
    receipts: ["Comprobantes", "Consulta los comprobantes internos de las operaciones"],
    reports: ["Reportes", "Resumen de actividad y comisiones de la filial"],
    profile: ["Mi perfil", "Datos del usuario y filial asignada"],
    help: ["Ayuda", "Guía rápida para operar el sistema"]
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><BadgeDollarSign size={22} /></div>
          <div>
            <strong>{businessName}</strong>
            <span>Gestión de filial</span>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}><X size={20} /></button>
        </div>

        <nav>
          {visibleSidebar.map(({ page: itemPage, label, icon: Icon }) => (
            <button
              className={`nav-item ${page === itemPage ? "active" : ""}`}
              key={itemPage}
              onClick={() => navigate(itemPage)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="support-card">
          <CircleHelp size={22} />
          <strong>¿Necesitas ayuda?</strong>
          <span>Soporte para tu filial</span>
          <button onClick={() => navigate("help")}>Ver ayuda <ChevronRight size={14} /></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="branch-lock" onClick={() => navigate("profile")}>
            <Building2 size={18} />
            <div>
              <strong>{branchName}</strong>
              <span>Filial asignada</span>
            </div>
            <LockKeyhole size={15} />
          </button>

          <div className="top-actions">
            <button className="icon-btn" title="Actualizar" onClick={() => void load()}><Bell size={19} /><i /></button>
            <button className="user-chip user-button" onClick={() => navigate("profile")}>
              <div className="avatar">{initials || "ZF"}</div>
              <div>
                <strong>{authUser.fullName}</strong>
                <span>{authUser.role.name} · {branchName}</span>
              </div>
            </button>
            <button className="icon-btn" title="Cerrar sesión" onClick={() => void logout()}><LogOut size={18} /></button>
          </div>
        </header>

        <section className="content">
          <div className="page-title-row">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
            <div>
              <div className="title-line">
                <h1>{pageMeta[page][0]}</h1>
                <span className="restricted"><LockKeyhole size={13} /> Vista restringida</span>
              </div>
              <p>{pageMeta[page][1]}</p>
            </div>
            <div className="page-actions">
              {canWrite && (page === "home" || page === "operations") && (
                <button className="primary" onClick={() => setOperationModal("YAPE_TO_CASH")}><Plus size={18} /> Nueva operación</button>
              )}
              {canWrite && (page === "home" || page === "cash") && (
                <button
                  className={`soft ${dashboard?.session ? "success" : ""}`}
                  onClick={() => dashboard?.session ? navigate("cash") : setOpenCashModal(true)}
                >
                  <WalletCards size={17} /> {dashboard?.session ? "Caja abierta" : "Abrir caja"}
                </button>
              )}
              {canWrite && (page === "home" || page === "cash" || page === "close") && dashboard?.session && (
                <button className="soft danger" onClick={() => setCloseCashModal(true)}><LockKeyhole size={17} /> Cerrar caja</button>
              )}
            </div>
          </div>

          {page === "home" && (
            <div className="scope-banner">
              <LockKeyhole size={19} />
              <div>
                <strong>{canWrite ? "Solo puedes ver y gestionar" : "Puedes consultar"} la información de tu filial: {branchName}</strong>
                <span>{canWrite ? "No tienes acceso a otras filiales ni a configuraciones generales del sistema." : "Tu acceso es de consulta; las acciones de caja y registro están reservadas para encargados."}</span>
              </div>
            </div>
          )}

          {apiError && <div className="error-banner">{apiError} <button onClick={() => void load()}><RefreshCw size={14} /> Reintentar</button></div>}

          {page === "home" && (
            <HomePage
              dashboard={dashboard}
              operations={operations}
              hourlyData={hourlyData}
              onNavigate={navigate}
              onNewOperation={(type) => setOperationModal(type)}
              onCloseCash={() => setCloseCashModal(true)}
              canWrite={canWrite}
            />
          )}

          {page === "operations" && (
            <OperationsPage
              operations={operations}
              onNewOperation={(type) => setOperationModal(type)}
              onReceipt={setReceipt}
              canCreate={canWrite}
              canCancel={Boolean(canWrite && dashboard?.session && (authUser.role.code !== "CASHIER" || settings?.allow_cashier_cancel))}
              onCancel={async (op) => {
                const reason = window.prompt("Motivo de anulación (mínimo 5 caracteres):");
                if (!reason) return;
                const response = await fetch(`/api/branches/${branchId}/operations/${op.id}/cancel`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  body: JSON.stringify({ reason })
                });
                const result = await response.json();
                if (!response.ok) {
                  window.alert(result.error ?? "No se pudo anular la operación");
                  return;
                }
                await load();
              }}
            />
          )}

          {page === "cash" && (
            <CashPage
              dashboard={dashboard}
              onOpen={() => setOpenCashModal(true)}
              onClose={() => setCloseCashModal(true)}
            />
          )}

          {page === "close" && (
            <ClosePage branchId={branchId} dashboard={dashboard} onClose={() => setCloseCashModal(true)} onOpen={() => setOpenCashModal(true)} />
          )}

          {page === "receipts" && <ReceiptsPage branchId={branchId} operations={operations} onReceipt={setReceipt} />}

          {page === "reports" && <ReportsPage branchId={branchId} dashboard={dashboard} />}

          {page === "profile" && <ProfilePage dashboard={dashboard} user={authUser} />}

          {page === "help" && <HelpPage onNavigate={navigate} canWrite={canWrite} />}
        </section>
      </main>

      {operationModal && (
        <OperationModal
          branchId={branchId}
          initialType={operationModal}
          settings={settings}
          onClose={() => setOperationModal(null)}
          onCreated={async () => {
            setOperationModal(null);
            await load();
          }}
        />
      )}

      {openCashModal && (
        <OpenCashModal
          branchId={branchId}
          onClose={() => setOpenCashModal(false)}
          onOpened={async () => {
            setOpenCashModal(false);
            await load();
          }}
        />
      )}

      {closeCashModal && dashboard && (
        <CloseCashModal
          branchId={branchId}
          dashboard={dashboard}
          onClose={() => setCloseCashModal(false)}
          onClosed={async () => {
            setCloseCashModal(false);
            await load();
            setPage("home");
          }}
        />
      )}

      {receipt && <ReceiptModal branchId={branchId} operation={receipt} branchName={branchName} businessName={businessName} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function LoginScreen({ onLogin, businessName }: { onLogin: (user: AuthUser) => void; businessName: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password, remember })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo iniciar sesión");
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-mark large"><BadgeDollarSign size={28} /></div>
        <div><strong>{businessName}</strong><span>Gestión segura de cajas y filiales</span></div>
      </div>
      <div className="login-layout">
        <section className="login-card">
          <span className="login-kicker">ACCESO SEGURO</span>
          <h1>Inicia sesión</h1>
          <p>Ingresa con la cuenta asignada por el administrador de {businessName}.</p>
          <form onSubmit={submit}>
            <label>Usuario<input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Tu usuario" required /></label>
            <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Tu contraseña" required /></label>
            <label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Mantener sesión iniciada</label>
            {error && <div className="modal-error">{error}</div>}
            <button className="primary login-button" disabled={saving}>{saving ? "Ingresando…" : `Ingresar a ${businessName}`}</button>
          </form>
        </section>
        <aside className="login-info">
          <div className="login-shield"><LockKeyhole size={28} /></div>
          <h2>Acceso según tu rol</h2>
          <p>Cada empleado entra únicamente a la filial y funciones autorizadas para su cuenta.</p>
          <div className="login-feature"><Check size={16} /><span>Sesiones protegidas con cookie HttpOnly</span></div>
          <div className="login-feature"><Check size={16} /><span>Contraseñas almacenadas con hash seguro</span></div>
          <div className="login-feature"><Check size={16} /><span>El servidor bloquea accesos a otras filiales</span></div>
          <small>Entorno local · acceso por IP</small>
        </aside>
      </div>
    </div>
  );
}

function HomePage({
  dashboard,
  operations,
  hourlyData,
  onNavigate,
  onNewOperation,
  onCloseCash,
  canWrite
}: {
  dashboard: Dashboard | null;
  operations: Operation[];
  hourlyData: Array<{ hour: string; value: number; height: number }>;
  onNavigate: (page: Page) => void;
  onNewOperation: (type: "YAPE_TO_CASH" | "CASH_TO_YAPE") => void;
  onCloseCash: () => void;
  canWrite: boolean;
}) {
  return (
    <>
      {canWrite && <div className="quick-actions">
        <button className="quick yape" onClick={() => onNewOperation("YAPE_TO_CASH")}><Smartphone size={20} /><div><strong>Yape → Efectivo</strong><span>Cliente paga por Yape; sube tu saldo Yape y entregas efectivo.</span></div><ChevronRight size={17} /></button>
        <button className="quick cash" onClick={() => onNewOperation("CASH_TO_YAPE")}><Send size={20} /><div><strong>Efectivo → Yape</strong><span>Recibes efectivo y envías Yape; sube el efectivo y baja tu saldo Yape.</span></div><ChevronRight size={17} /></button>
      </div>}

      <div className="kpi-grid">
        <Kpi icon={<ReceiptText />} tone="blue" label="Operaciones hoy" value={String(dashboard?.metrics.operationsToday ?? 0)} hint="Actividad de hoy" />
        <Kpi icon={<Smartphone />} tone="purple" label="Yape recibido" value={currency(dashboard?.metrics.yapeReceived)} hint="Operaciones completadas" />
        <Kpi icon={<WalletCards />} tone="green" label="Efectivo entregado" value={currency(dashboard?.metrics.cashDelivered)} hint="Operaciones completadas" />
        <Kpi icon={<BadgeDollarSign />} tone="orange" label="Comisión del día" value={currency(dashboard?.metrics.commissionTotal)} hint="Acumulado" />
        <Kpi icon={<WalletCards />} tone="cyan" label="Caja actual" value={currency(dashboard?.metrics.cashCurrent)} hint="Según operaciones" />
        <Kpi icon={<Scale />} tone="purple" label="Diferencia de caja" value={currency(dashboard?.metrics.cashDifference)} hint="Cuadra" positive />
      </div>

      <div className="analytics-grid">
        <section className="card chart-card">
          <div className="card-head">
            <div><strong>Operaciones por hora</strong><span>Actividad registrada hoy</span></div>
            <button className="ghost" onClick={() => onNavigate("reports")}>Ver reporte</button>
          </div>
          <div className="bars">
            {hourlyData.map((item) => (
              <div className="bar-col" key={item.hour}>
                <div className="bar-track"><div className="bar-fill" style={{ height: `${item.height}%` }} title={`${item.value} operaciones`} /></div>
                <span>{item.hour}:00</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card summary-card">
          <div className="card-head">
            <div><strong>Resumen del día</strong><span>{dashboard?.branch.name ?? "Miraflores"}</span></div>
          </div>
          <SummaryRow icon={<ReceiptText />} label="Total de operaciones" value={String(dashboard?.metrics.operationsToday ?? 0)} />
          <SummaryRow icon={<Smartphone />} label="Saldo Yape" value={currency(dashboard?.metrics.walletCurrent)} />
          <SummaryRow icon={<WalletCards />} label="Caja actual" value={currency(dashboard?.metrics.cashCurrent)} />
          <SummaryRow icon={<BadgeDollarSign />} label="Comisión generada" value={currency(dashboard?.metrics.commissionTotal)} />
          <SummaryRow icon={<Scale />} label="Diferencia de caja" value={currency(dashboard?.metrics.cashDifference)} />
        </section>
      </div>

      <div className="bottom-grid">
        <section className="card operations-card">
          <div className="card-head">
            <div><strong>Operaciones recientes - {dashboard?.branch.name ?? "Miraflores"}</strong><span>Solo movimientos de tu filial</span></div>
            <button className="ghost" onClick={() => onNavigate("operations")}>Ver todas</button>
          </div>
          <OperationsTable operations={operations.slice(0, 8)} />
        </section>

        <section className="card checklist">
          <div className="card-head">
            <div><strong>{canWrite ? "Checklist de caja" : "Resumen de consulta"}</strong><span>Hoy</span></div>
            <Settings2 size={17} className="muted" />
          </div>
          {!canWrite && <div className="readonly-summary"><LockKeyhole size={18}/><div><strong>Acceso de consulta</strong><span>Puedes revisar operaciones, comprobantes y reportes de tu filial.</span></div></div>}
          {canWrite && <>
          {[
            ["Caja abierta", Boolean(dashboard?.session)],
            ["Registrar operaciones", (dashboard?.metrics.operationsToday ?? 0) > 0],
            ["Verificar comprobantes", true],
            ["Revisar diferencia de caja", true],
            ["Cierre diario", !dashboard?.session]
          ].map(([label, done]) => (
            <div className="check-row" key={String(label)}>
              <span className={done ? "check done" : "check"}>{done && <Check size={13} />}</span>
              <div><strong>{String(label)}</strong><span>{done ? "Completado" : "Pendiente"}</span></div>
            </div>
          ))}
          {dashboard?.session && <button className="close-day" onClick={onCloseCash}><LockKeyhole size={17} /> Cerrar caja</button>}
          </>}
        </section>
      </div>
    </>
  );
}

function OperationsPage({
  operations,
  onNewOperation,
  onReceipt,
  canCreate,
  canCancel,
  onCancel
}: {
  operations: Operation[];
  onNewOperation: (type: "YAPE_TO_CASH" | "CASH_TO_YAPE") => void;
  onReceipt: (op: Operation) => void;
  canCreate: boolean;
  canCancel: boolean;
  onCancel: (op: Operation) => void | Promise<void>;
}) {
  const [filter, setFilter] = useState<"ALL" | "YAPE_TO_CASH" | "CASH_TO_YAPE">("ALL");
  const filtered = filter === "ALL" ? operations : operations.filter((op) => op.operation_type === filter);

  return (
    <>
      {canCreate && <div className="quick-actions">
        <button className="quick yape" onClick={() => onNewOperation("YAPE_TO_CASH")}><Smartphone size={20} /><div><strong>Yape → Efectivo</strong><span>Cliente paga por Yape; sube tu saldo Yape y entregas efectivo.</span></div><Plus size={17} /></button>
        <button className="quick cash" onClick={() => onNewOperation("CASH_TO_YAPE")}><Send size={20} /><div><strong>Efectivo → Yape</strong><span>Recibes efectivo y envías Yape; sube el efectivo y baja tu saldo Yape.</span></div><Plus size={17} /></button>
      </div>}
      <section className="card page-card">
        <div className="card-head">
          <div><strong>Historial de operaciones</strong><span>{filtered.length} registros cargados</span></div>
          <div className="filter-group">
            <button className={filter === "ALL" ? "filter active" : "filter"} onClick={() => setFilter("ALL")}>Todas</button>
            <button className={filter === "YAPE_TO_CASH" ? "filter active" : "filter"} onClick={() => setFilter("YAPE_TO_CASH")}>Yape → Efectivo</button>
            <button className={filter === "CASH_TO_YAPE" ? "filter active" : "filter"} onClick={() => setFilter("CASH_TO_YAPE")}>Efectivo → Yape</button>
          </div>
        </div>
        <OperationsTable operations={filtered} onReceipt={onReceipt} onCancel={canCancel ? onCancel : undefined} />
      </section>
    </>
  );
}

function CashPage({
  dashboard,
  onOpen,
  onClose
}: {
  dashboard: Dashboard | null;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="detail-grid">
      <section className="card large-panel">
        <div className="panel-title"><WalletCards size={22} /><div><h2>Estado de caja</h2><p>{dashboard?.session ? "Turno activo" : "Caja cerrada"}</p></div></div>
        <div className="cash-status">
          <div><span>Estado</span><strong className={dashboard?.session ? "green-text" : "red-text"}>{dashboard?.session ? "ABIERTA" : "CERRADA"}</strong></div>
          <div><span>Efectivo actual</span><strong>{currency(dashboard?.metrics.cashCurrent)}</strong></div>
          <div><span>Saldo Yape</span><strong>{currency(dashboard?.metrics.walletCurrent)}</strong></div>
          <div><span>Ganancia del turno</span><strong>{currency(dashboard?.metrics.sessionCommissionTotal)}</strong></div>
        </div>
        {dashboard?.session ? (
          <div className="info-box">
            <strong>Turno iniciado</strong>
            <span>{new Date(dashboard.session.started_at).toLocaleString("es-PE")}</span>
            <span>Efectivo inicial: {currency(dashboard.session.initial_cash)}</span>
            <span>Saldo Yape inicial: {currency(dashboard.session.initial_wallet)}</span>
          </div>
        ) : (
          <div className="empty-state"><WalletCards size={28} /><strong>No hay caja abierta</strong><span>Abre una caja para empezar a registrar operaciones.</span></div>
        )}
      </section>
      <section className="card action-panel">
        <h3>Acciones de caja</h3>
        {!dashboard?.session ? (
          <button className="primary full" onClick={onOpen}><WalletCards size={17} /> Abrir caja</button>
        ) : (
          <button className="soft danger full" onClick={onClose}><LockKeyhole size={17} /> Cerrar caja</button>
        )}
      </section>
    </div>
  );
}

function ClosePage({ branchId, dashboard, onClose, onOpen }: { branchId: number; dashboard: Dashboard | null; onClose: () => void; onOpen: () => void }) {
  const [preview, setPreview] = useState<ClosurePreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dashboard?.session) {
      setPreview(null);
      return;
    }
    void (async () => {
      try {
        setError("");
        const response = await fetch(`/api/branches/${branchId}/cash/close-preview`, { credentials: "same-origin" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No se pudo calcular el cierre");
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo calcular el cierre");
      }
    })();
  }, [branchId, dashboard?.session?.id]);

  if (!dashboard?.session) {
    return (
      <section className="card empty-page">
        <ClipboardCheck size={34} />
        <h2>No hay un turno abierto</h2>
        <p>Primero debes abrir caja para poder realizar un cierre diario.</p>
        <button className="primary" onClick={onOpen}>Abrir caja</button>
      </section>
    );
  }

  return (
    <div className="detail-grid">
      <section className="card large-panel">
        <div className="panel-title"><ClipboardCheck size={22} /><div><h2>Resumen para cierre</h2><p>Conciliación calculada sobre el turno abierto</p></div></div>
        {error && <div className="modal-error">{error}</div>}
        {!preview ? <div className="owner-loading">Calculando cierre…</div> : <>
          <div className="cash-status closure-preview-grid">
            <div><span>Efectivo esperado</span><strong>{currency(preview.expectedCash)}</strong></div>
            <div><span>Yape esperado</span><strong>{currency(preview.expectedWallet)}</strong></div>
            <div><span>Operaciones</span><strong>{preview.operationCount}</strong></div>
            <div><span>Comisión total</span><strong>{currency(preview.commissionTotal)}</strong></div>
          </div>
          <div className="commission-split-summary">
            <span>Ganancia del encargado</span>
            <strong>{currency(preview.commissionTotal)}</strong>
          </div>
          <div className="closure-turn-info">
            <div><span>Responsable actual</span><strong>{preview.assignedTo ?? "—"}</strong></div>
            <div><span>Turno iniciado</span><strong>{formatDate(preview.startedAt)}</strong></div>
            <div><span>Efectivo inicial</span><strong>{currency(preview.initialCash)}</strong></div>
            <div><span>Yape inicial</span><strong>{currency(preview.initialWallet)}</strong></div>
          </div>
          <div className="scope-banner compact"><Scale size={18} /><div><strong>El sistema comparará estos montos con lo declarado.</strong><span>Si hay faltante o sobrante, la observación será obligatoria y quedará registrada.</span></div></div>
        </>}
      </section>
      <section className="card action-panel">
        <h3>Finalizar turno</h3>
        <p>Cuenta el efectivo y confirma el saldo de Yape antes de continuar.</p>
        <button className="soft danger full" onClick={onClose} disabled={!preview}><LockKeyhole size={17} /> Iniciar cierre</button>
      </section>
    </div>
  );
}

function ReceiptsPage({ branchId, operations, onReceipt }: { branchId: number; operations: Operation[]; onReceipt: (op: Operation) => void }) {
  const completed = operations.filter((op) => op.status === "COMPLETED");
  function receiptNo(op: Operation) {
    return op.receipt_series && op.receipt_number
      ? `${op.receipt_series}-${String(op.receipt_number).padStart(6,"0")}`
      : `Z-${String(op.id).padStart(6,"0")}`;
  }

  return (
    <section className="card page-card">
      <div className="card-head"><div><strong>Comprobantes internos</strong><span>Correlativo interno automático por cada operación completada</span></div></div>
      <div className="receipt-list">
        {completed.map((op) => (
          <div className="receipt-row" key={op.id}>
            <div className="receipt-icon"><ReceiptText size={18} /></div>
            <button className="receipt-main-button" onClick={() => onReceipt(op)}>
              <strong>{receiptNo(op)}</strong><span>{formatDate(op.created_at)} · {op.customer_name ?? "Cliente"}</span>
            </button>
            <div><strong>{currency(op.amount)}</strong><span>Comisión {currency(op.commission)}</span></div>
            <div className="receipt-actions">
              <button className="mini-button" onClick={() => onReceipt(op)}>Ver</button>
              <button className="mini-button" onClick={() => window.open(`/api/branches/${branchId}/receipts/${op.id}/pdf`, "_blank")}><Download size={12}/> PDF</button>
            </div>
          </div>
        ))}
        {!completed.length && <div className="empty-cell">Todavía no hay comprobantes.</div>}
      </div>
      <div className="receipt-legal-note">Los comprobantes mostrados aquí son documentos internos de control. No sustituyen un comprobante de pago electrónico SUNAT.</div>
    </section>
  );
}

function ReportsPage({ branchId, dashboard }: { branchId: number; dashboard: Dashboard | null }) {
  const now = new Date();
  const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
  const [from, setFrom] = useState(localToday.slice(0,8) + "01");
  const [to, setTo] = useState(localToday);
  const [report, setReport] = useState<BranchFinancialReport | null>(null);
  const [error, setError] = useState("");

  function qs() {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }

  useEffect(() => {
    void (async () => {
      try {
        setError("");
        const response = await fetch(`/api/branches/${branchId}/reports/summary?${qs()}`, { credentials: "same-origin" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No se pudo generar el reporte");
        setReport(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo generar el reporte");
      }
    })();
  }, [branchId, from, to]);

  const summary = report?.summary;

  return (
    <>
      <section className="card report-toolbar branch-report-toolbar">
        <div className="report-toolbar-title"><BarChart3 size={19}/><div><strong>Reporte de filial</strong><span>Selecciona el periodo y exporta PDF o Excel.</span></div></div>
        <div className="admin-filters admin-filters-wide">
          <label className="date-filter"><span>Desde</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></label>
          <label className="date-filter"><span>Hasta</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></label>
          <button className="soft export-button" onClick={()=>window.open(`/api/branches/${branchId}/reports/export.pdf?${qs()}`,"_blank")}><Download size={14}/> PDF</button>
          <button className="primary export-button" onClick={()=>window.open(`/api/branches/${branchId}/reports/export.xlsx?${qs()}`,"_blank")}><Download size={14}/> Excel</button>
        </div>
      </section>
      {error && <div className="error-banner">{error}</div>}
      <div className="kpi-grid reports-kpi">
        <Kpi icon={<ReceiptText />} tone="blue" label="Operaciones" value={String(summary?.operationCount ?? 0)} hint="Periodo seleccionado" />
        <Kpi icon={<Smartphone />} tone="purple" label="Yape → Efectivo" value={String(summary?.yapeToCashCount ?? 0)} hint="Operaciones" />
        <Kpi icon={<Send />} tone="green" label="Efectivo → Yape" value={String(summary?.cashToYapeCount ?? 0)} hint="Operaciones" />
        <Kpi icon={<BadgeDollarSign />} tone="orange" label="Monto movilizado" value={currency(summary?.amountTotal)} hint="Periodo seleccionado" />
        <Kpi icon={<BadgeDollarSign />} tone="cyan" label="Ganancia del encargado" value={currency(summary?.commissionTotal)} hint="Comisiones del periodo" />
        <Kpi icon={<WalletCards />} tone="blue" label="Caja actual" value={currency(dashboard?.metrics.cashCurrent)} hint="Turno actual" />
      </div>

    </>
  );
}

function ProfilePage({ dashboard, user }: { dashboard: Dashboard | null; user: AuthUser }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "No se pudo cambiar la contraseña");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setMessage("Contraseña actualizada correctamente.");
  }

  return (
    <div className="detail-grid">
      <section className="card large-panel">
        <div className="profile-head">
          <div className="avatar big">{user.fullName.split(/\s+/).filter(Boolean).slice(0,2).map((p) => p[0]).join("").toUpperCase()}</div>
          <div><h2>{user.fullName}</h2><p>{user.role.name}</p></div>
        </div>
        <div className="profile-details">
          <div><span>Usuario</span><strong>{user.username}</strong></div>
          <div><span>Rol</span><strong>{user.role.name}</strong></div>
          <div><span>Filial visible</span><strong>{dashboard?.branch.name ?? user.branch?.name ?? user.defaultBranch?.name ?? "—"}</strong></div>
          <div><span>Permisos</span><strong>{user.permissions.includes("GLOBAL_WRITE") ? "Acceso global" : "Acceso por filial"}</strong></div>
        </div>
      </section>
      <section className="card action-panel">
        <h3>Cambiar contraseña</h3>
        <p>Usa al menos 10 caracteres, una mayúscula, una minúscula y un número.</p>
        <form className="password-form" onSubmit={changePassword}>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Contraseña actual" required />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nueva contraseña" minLength={10} required />
          {error && <div className="modal-error">{error}</div>}
          {message && <div className="success-message">{message}</div>}
          <button className="primary full">Actualizar contraseña</button>
        </form>
      </section>
    </div>
  );
}

function HelpPage({ onNavigate, canWrite }: { onNavigate: (page: Page) => void; canWrite: boolean }) {
  const items: Array<[string, string, Page]> = canWrite ? [
    ["Registrar una operación", "Usa Operaciones y selecciona Yape → Efectivo o Efectivo → Yape.", "operations"],
    ["Controlar la caja", "Revisa efectivo, saldo Yape y estado del turno.", "cash"],
    ["Cerrar el día", "Declara los montos reales y compara la diferencia.", "close"],
    ["Ver comprobantes", "Consulta el comprobante interno de cada movimiento.", "receipts"]
  ] : [
    ["Consultar operaciones", "Revisa los movimientos registrados en tu filial.", "operations"],
    ["Ver comprobantes", "Consulta los comprobantes internos disponibles.", "receipts"],
    ["Revisar reportes", "Consulta actividad y comisiones.", "reports"]
  ];

  return (
    <div className="help-grid">
      {items.map(([title, description, target]) => (
        <button className="card help-card" key={title} onClick={() => onNavigate(target)}>
          <CircleHelp size={22} />
          <strong>{title}</strong>
          <span>{description}</span>
          <em>Ir a la sección <ChevronRight size={14} /></em>
        </button>
      ))}
    </div>
  );
}

function OperationsTable({ operations, onReceipt, onCancel }: { operations: Operation[]; onReceipt?: (op: Operation) => void; onCancel?: (op: Operation) => void | Promise<void> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Código / Referencia</th>
            <th>Monto</th>
            <th>Comisión</th>
            <th>Entregado</th>
            <th>Estado</th>
            {(onReceipt || onCancel) && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => (
            <tr key={op.id}>
              <td>{formatDate(op.created_at)}</td>
              <td><span className={`type-pill ${op.operation_type === "YAPE_TO_CASH" ? "yape" : "cash"}`}>{op.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape"}</span></td>
              <td>{op.customer_name ?? "—"}</td>
              <td>{op.reference_code ?? "—"}</td>
              <td>{currency(op.amount)}</td>
              <td>{currency(op.commission)}</td>
              <td>{currency(op.net_amount)}</td>
              <td><span className={`status ${operationStatusClass(op.status)}`}><i />{operationStatusLabel(op.status)}</span></td>
              {(onReceipt || onCancel) && <td><div className="inline-actions">{onReceipt && <button className="mini-button" onClick={() => onReceipt(op)}><ReceiptText size={13} /> Ver</button>}{onCancel && op.status === "COMPLETED" && <button className="mini-button danger-mini" onClick={() => void onCancel(op)}>Anular</button>}</div></td>}
            </tr>
          ))}
          {!operations.length && <tr><td colSpan={(onReceipt || onCancel) ? 9 : 8} className="empty-cell">No hay operaciones para mostrar.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ icon, tone, label, value, hint, positive }: { icon: ReactNode; tone: string; label: string; value: string; hint: string; positive?: boolean }) {
  return (
    <section className="card kpi">
      <div className={`kpi-icon ${tone}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={positive ? "positive" : ""}>{positive ? "✓ " : ""}{hint}</small>
    </section>
  );
}

function SummaryRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="summary-row">
      <span className="summary-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div className="report-bar-row">
      <div><strong>{label}</strong><span>{value} operaciones · {pct}%</span></div>
      <div className="progress"><i className={tone} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function OperationModal({
  branchId,
  initialType,
  settings,
  onClose,
  onCreated
}: {
  branchId: number;
  initialType: "YAPE_TO_CASH" | "CASH_TO_YAPE";
  settings: Settings | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<"YAPE_TO_CASH" | "CASH_TO_YAPE">(initialType);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [customer, setCustomer] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const numericAmount = Number(amount || 0);
  const commission = settings
    ? settings.commission_type === "PERCENT"
      ? numericAmount * (Number(settings.commission_value) / 100)
      : Number(settings.commission_value)
    : 0;
  const net = Math.max(0, numericAmount - commission);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/branches/${branchId}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationType: type,
          amount: numericAmount,
          referenceCode: reference || undefined,
          customerName: customer || undefined
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar la operación");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div><h2>Nueva operación</h2><p>La comisión se calcula automáticamente.</p></div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={19} /></button>
        </div>
        <label>Tipo de operación</label>
        <div className="operation-types">
          <button type="button" className={type === "YAPE_TO_CASH" ? "selected yape" : ""} onClick={() => setType("YAPE_TO_CASH")}><Smartphone size={19} /><span className="operation-choice-copy"><strong>Yape → Efectivo</strong><small>El cliente paga por Yape; aumenta tu saldo Yape y entregas efectivo.</small></span></button>
          <button type="button" className={type === "CASH_TO_YAPE" ? "selected cash" : ""} onClick={() => setType("CASH_TO_YAPE")}><Send size={19} /><span className="operation-choice-copy"><strong>Efectivo → Yape</strong><small>Recibes efectivo y envías Yape; aumenta el efectivo y baja tu saldo Yape.</small></span></button>
        </div>
        <div className="field-grid">
          <label>Monto
            <div className="input-prefix"><span>S/</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" required /></div>
            <small>Máximo actual: {currency(settings?.max_operation_amount ?? 50)}</small>
          </label>
          <label>Código / referencia
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. 850421" required={type === "YAPE_TO_CASH" || Boolean(settings?.require_cash_to_yape_reference)} />
            <small>{type === "YAPE_TO_CASH" || Boolean(settings?.require_cash_to_yape_reference) ? "Código/referencia obligatorio" : "Opcional"}</small>
          </label>
        </div>
        <label>Cliente<input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nombre opcional" /></label>
        <div className="calculation">
          <div><span>Monto</span><strong>{currency(numericAmount)}</strong></div>
          <div><span>Comisión</span><strong>- {currency(commission)}</strong></div>
          <div className="net"><span>Monto a entregar</span><strong>{currency(net)}</strong></div>
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Registrar operación"}</button>
        </div>
      </form>
    </div>
  );
}

function OpenCashModal({ branchId, onClose, onOpened }: { branchId: number; onClose: () => void; onOpened: () => void }) {
  const [cash, setCash] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/branches/${branchId}/cash/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialCash: Number(cash || 0), initialWallet: Number(wallet || 0) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo abrir la caja");
      onOpened();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al abrir caja");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal small-modal" onSubmit={submit}>
        <div className="modal-head"><div><h2>Abrir caja</h2><p>Declara con cuánto inicia el turno.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={19} /></button></div>
        <div className="field-grid">
          <label>Efectivo inicial<div className="input-prefix"><span>S/</span><input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" required /></div></label>
          <label>Saldo Yape inicial<div className="input-prefix"><span>S/</span><input value={wallet} onChange={(e) => setWallet(e.target.value)} inputMode="decimal" required /></div></label>
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Abriendo…" : "Abrir caja"}</button></div>
      </form>
    </div>
  );
}

function CloseCashModal({ branchId, dashboard, onClose, onClosed }: { branchId: number; dashboard: Dashboard; onClose: () => void; onClosed: () => void }) {
  const [preview, setPreview] = useState<ClosurePreview | null>(null);
  const [cash, setCash] = useState("");
  const [wallet, setWallet] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | {
    closureId: number;
    resultType: "BALANCED" | "SHORTAGE" | "SURPLUS" | "MIXED";
    expectedCash: number; declaredCash: number; differenceCash: number;
    expectedWallet: number; declaredWallet: number; differenceWallet: number;
    operationCount: number; commissionTotal: number; staffShareTotal: number; partnerShareTotal: number; unassignedCommission: number;
    assignedTo: string | null; notes: string | null;
  }>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/branches/${branchId}/cash/close-preview`, { credentials: "same-origin" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "No se pudo preparar el cierre");
        setPreview(data);
        setCash(String(data.expectedCash));
        setWallet(String(data.expectedWallet));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo preparar el cierre");
      }
    })();
  }, [branchId, dashboard.session?.id]);

  const expectedCash = preview?.expectedCash ?? dashboard.metrics.cashCurrent;
  const expectedWallet = preview?.expectedWallet ?? dashboard.metrics.walletCurrent;
  const cashDiff = Number(cash || 0) - expectedCash;
  const walletDiff = Number(wallet || 0) - expectedWallet;
  const hasDifference = Math.abs(cashDiff) >= 0.005 || Math.abs(walletDiff) >= 0.005;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!preview) return;
    if (hasDifference && notes.trim().length < 5) {
      setError("Cuando existe una diferencia debes escribir una observación de al menos 5 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/branches/${branchId}/cash/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          declaredCash: Number(cash || 0),
          declaredWallet: Number(wallet || 0),
          notes: notes.trim() || undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo cerrar la caja");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cerrar caja");
    } finally {
      setSaving(false);
    }
  }

  function resultLabel(type: "BALANCED" | "SHORTAGE" | "SURPLUS" | "MIXED") {
    if (type === "BALANCED") return "Caja cuadrada";
    if (type === "SHORTAGE") return "Faltante detectado";
    if (type === "SURPLUS") return "Sobrante detectado";
    return "Diferencias mixtas";
  }

  if (result) {
    const balanced = result.resultType === "BALANCED";
    return (
      <div className="modal-backdrop">
        <div className="modal closure-result-modal">
          <div className={balanced ? "closure-success" : "closure-result-warning"}>
            {balanced ? <Check size={24}/> : <Scale size={24}/>}
            <div><h2>{balanced ? "Caja cerrada correctamente" : "Caja cerrada con diferencia"}</h2><p>{resultLabel(result.resultType)}. El cierre quedó registrado en la bitácora.</p></div>
          </div>

          <div className="closure-result-status">
            <span>Resultado</span><strong className={balanced ? "green-text" : "red-text"}>{resultLabel(result.resultType)}</strong>
          </div>

          <div className="closure-result-grid simple">
            <div><span>Operaciones</span><strong>{result.operationCount}</strong></div>
            <div><span>Comisión total</span><strong>{currency(result.commissionTotal)}</strong></div>
            <div><span>Diferencia efectivo</span><strong className={Math.abs(result.differenceCash)<0.005?"green-text":"red-text"}>{currency(result.differenceCash)}</strong></div>
            <div><span>Diferencia Yape</span><strong className={Math.abs(result.differenceWallet)<0.005?"green-text":"red-text"}>{currency(result.differenceWallet)}</strong></div>
          </div>

          <div className="closure-compact-details">
            <div>
              <span>Conciliación</span>
              <strong>Efectivo {currency(result.declaredCash)} de {currency(result.expectedCash)} · Yape {currency(result.declaredWallet)} de {currency(result.expectedWallet)}</strong>
            </div>
            <div>
              <span>Ganancia del encargado</span>
              <strong>{currency(result.commissionTotal)}</strong>
            </div>
          </div>

          {result.notes && <div className="closure-result-note"><span>Observación</span><strong>{result.notes}</strong></div>}

          <div className="modal-actions">
            <button className="soft" onClick={() => window.open(`/api/branches/${branchId}/closures/${result.closureId}/pdf`, "_blank")}><Download size={15}/> Descargar PDF</button>
            <button className="primary" onClick={onClosed}>Finalizar cierre</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <form className="modal closure-modal" onSubmit={submit}>
        <div className="modal-head"><div><h2>Cierre de caja</h2><p>Ingresa lo que realmente tienes al finalizar el turno.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={19} /></button></div>

        {!preview ? <div className="owner-loading">Preparando cierre…</div> : <>
          <div className="calculation closure-calculation">
            <div><span>Efectivo esperado</span><strong>{currency(preview.expectedCash)}</strong></div>
            <div><span>Yape esperado</span><strong>{currency(preview.expectedWallet)}</strong></div>
            <div><span>Operaciones</span><strong>{preview.operationCount}</strong></div>
            <div><span>Comisión</span><strong>{currency(preview.commissionTotal)}</strong></div>
          </div>
          <div className="commission-split-summary">
            <span>Ganancia del encargado</span>
            <strong>{currency(preview.commissionTotal)}</strong>
          </div>

          <div className="field-grid">
            <label>Efectivo declarado<div className="input-prefix"><span>S/</span><input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" required /></div><small className={Math.abs(cashDiff)<0.005?"green-text":"red-text"}>Diferencia: {currency(cashDiff)}</small></label>
            <label>Yape declarado<div className="input-prefix"><span>S/</span><input value={wallet} onChange={(e) => setWallet(e.target.value)} inputMode="decimal" required /></div><small className={Math.abs(walletDiff)<0.005?"green-text":"red-text"}>Diferencia: {currency(walletDiff)}</small></label>
          </div>

          <div className={hasDifference ? "closure-difference-alert" : "closure-balanced-alert"}>
            <Scale size={17}/>
            <div><strong>{hasDifference ? "Existe una diferencia" : "Los montos cuadran"}</strong><span>{hasDifference ? "Debes indicar el motivo antes de confirmar el cierre." : "No se detectan diferencias con los valores esperados."}</span></div>
          </div>

          <label>Observación{hasDifference && <span className="required-mark"> · obligatoria</span>}<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={hasDifference ? "Ej. faltante por sencillo, ajuste pendiente…" : "Opcional"} required={hasDifference} /></label>
          <div className="closure-warning"><LockKeyhole size={16}/><span>Al confirmar, el turno quedará cerrado. Para registrar nuevas operaciones será necesario abrir una nueva caja.</span></div>
        </>}

        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="soft danger" disabled={saving || !preview}>{saving ? "Cerrando…" : "Confirmar cierre"}</button></div>
      </form>
    </div>
  );
}

function ReceiptModal({ branchId, operation, branchName, businessName, onClose }: { branchId: number; operation: Operation; branchName: string; businessName: string; onClose: () => void }) {
  const receiptNumber = operation.receipt_series && operation.receipt_number
    ? `${operation.receipt_series}-${String(operation.receipt_number).padStart(6,"0")}`
    : `Z-${String(operation.id).padStart(6,"0")}`;
  return (
    <div className="modal-backdrop">
      <div className="modal receipt-modal">
        <div className="modal-head"><div><h2>Comprobante interno</h2><p>{receiptNumber}</p></div><button className="icon-btn" onClick={onClose}><X size={19} /></button></div>
        <div className="ticket">
          <strong className="ticket-brand">{businessName}</strong>
          <span>{branchName}</span>
          <hr />
          <div><span>Comprobante</span><strong>{receiptNumber}</strong></div>
          <div><span>Fecha</span><strong>{formatDate(operation.created_at)}</strong></div>
          <div><span>Tipo</span><strong>{operation.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape"}</strong></div>
          <div><span>Referencia</span><strong>{operation.reference_code ?? "—"}</strong></div>
          <div><span>Cliente</span><strong>{operation.customer_name ?? "—"}</strong></div>
          <hr />
          <div><span>Monto</span><strong>{currency(operation.amount)}</strong></div>
          <div><span>Comisión</span><strong>{currency(operation.commission)}</strong></div>
          <div className="ticket-total"><span>Entregado</span><strong>{currency(operation.net_amount)}</strong></div>
        </div>
        <div className="receipt-tax-note">Documento interno de control. No es comprobante de pago electrónico SUNAT.</div>
        <div className="modal-actions"><button className="ghost-button" onClick={onClose}>Cerrar</button><button className="soft" onClick={() => window.open(`/api/branches/${branchId}/receipts/${operation.id}/pdf`, "_blank")}><Download size={16} /> PDF 80 mm</button><button className="primary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button></div>
      </div>
    </div>
  );
}

export default App;
