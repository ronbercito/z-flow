import { FormEvent, useEffect, useMemo, useState } from "react";
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
  Home,
  LockKeyhole,
  Menu,
  Plus,
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

type Operation = {
  id: number;
  operation_type: "YAPE_TO_CASH" | "CASH_TO_YAPE";
  reference_code: string | null;
  customer_name: string | null;
  amount: number;
  commission: number;
  net_amount: number;
  status: string;
  created_at: string;
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
};

const sidebar = [
  { label: "Inicio", icon: Home, active: true },
  { label: "Operaciones", icon: ReceiptText },
  { label: "Caja", icon: WalletCards },
  { label: "Cierre diario", icon: ClipboardCheck },
  { label: "Comprobantes", icon: FileText },
  { label: "Reportes", icon: BarChart3 },
  { label: "Mi perfil", icon: UserRound },
  { label: "Ayuda", icon: CircleHelp }
];

const demoHours = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"];

function currency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2
  }).format(Number(value ?? 0));
}

function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  async function load() {
    setLoading(true);
    setApiError("");
    try {
      const [dashboardRes, settingsRes] = await Promise.all([
        fetch("/api/branches/1/dashboard"),
        fetch("/api/branches/1/settings")
      ]);

      if (!dashboardRes.ok || !settingsRes.ok) {
        throw new Error("No se pudo obtener la información de la filial");
      }

      setDashboard(await dashboardRes.json());
      setSettings(await settingsRes.json());
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const hourlyData = useMemo(() => {
    const count = Object.fromEntries(demoHours.map((hour) => [hour, 0]));
    for (const op of dashboard?.recentOperations ?? []) {
      const date = new Date(op.created_at);
      const hour = String(date.getHours()).padStart(2, "0");
      if (hour in count) count[hour] += 1;
    }
    const max = Math.max(...Object.values(count), 1);
    return demoHours.map((hour) => ({
      hour,
      value: count[hour],
      height: Math.max(12, (count[hour] / max) * 100)
    }));
  }, [dashboard]);

  if (loading && !dashboard) {
    return <div className="splash">Cargando Z-FLOW…</div>;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><BadgeDollarSign size={22} /></div>
          <div>
            <strong>Z-FLOW</strong>
            <span>Gestión de filial</span>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}><X size={20} /></button>
        </div>

        <nav>
          {sidebar.map(({ label, icon: Icon, active }) => (
            <button className={`nav-item ${active ? "active" : ""}`} key={label}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="support-card">
          <CircleHelp size={22} />
          <strong>¿Necesitas ayuda?</strong>
          <span>Soporte para tu filial</span>
          <button>Ver ayuda <ChevronRight size={14} /></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="branch-lock">
            <Building2 size={18} />
            <div>
              <strong>{dashboard?.branch.name ?? "Miraflores"}</strong>
              <span>Filial asignada</span>
            </div>
            <LockKeyhole size={15} />
          </div>

          <div className="top-actions">
            <button className="icon-btn"><Bell size={19} /><i /></button>
            <div className="user-chip">
              <div className="avatar">JP</div>
              <div>
                <strong>Juan Pérez</strong>
                <span>Encargado - {dashboard?.branch.name ?? "Miraflores"}</span>
              </div>
            </div>
          </div>
        </header>

        <section className="content">
          <div className="page-title-row">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
            <div>
              <div className="title-line">
                <h1>Panel de filial - {dashboard?.branch.name ?? "Miraflores"}</h1>
                <span className="restricted"><LockKeyhole size={13} /> Vista restringida</span>
              </div>
              <p>Resumen operativo del día</p>
            </div>
            <div className="page-actions">
              <button className="primary" onClick={() => setModalOpen(true)}><Plus size={18} /> Nueva operación</button>
              <button className="soft success"><WalletCards size={17} /> {dashboard?.session ? "Caja abierta" : "Abrir caja"}</button>
              <button className="soft danger"><LockKeyhole size={17} /> Cerrar caja</button>
            </div>
          </div>

          <div className="scope-banner">
            <LockKeyhole size={19} />
            <div>
              <strong>Solo puedes ver y gestionar la información de tu filial: {dashboard?.branch.name ?? "Miraflores"}</strong>
              <span>No tienes acceso a otras filiales ni a configuraciones generales del sistema.</span>
            </div>
          </div>

          {apiError && <div className="error-banner">{apiError} <button onClick={() => void load()}><RefreshCw size={14} /> Reintentar</button></div>}

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
                <div>
                  <strong>Operaciones por hora</strong>
                  <span>Actividad registrada hoy</span>
                </div>
                <button className="ghost">Hoy</button>
              </div>
              <div className="bars">
                {hourlyData.map((item) => (
                  <div className="bar-col" key={item.hour}>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${item.height}%` }} title={`${item.value} operaciones`} />
                    </div>
                    <span>{item.hour}:00</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card summary-card">
              <div className="card-head">
                <div>
                  <strong>Resumen del día</strong>
                  <span>{dashboard?.branch.name ?? "Miraflores"}</span>
                </div>
                <RefreshCw size={16} className="muted" onClick={() => void load()} />
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
                <div>
                  <strong>Operaciones recientes - {dashboard?.branch.name ?? "Miraflores"}</strong>
                  <span>Solo movimientos de tu filial</span>
                </div>
                <button className="ghost">Ver todas</button>
              </div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.recentOperations ?? []).map((op) => (
                      <tr key={op.id}>
                        <td>{new Date(op.created_at).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        <td><span className={`type-pill ${op.operation_type === "YAPE_TO_CASH" ? "yape" : "cash"}`}>{op.operation_type === "YAPE_TO_CASH" ? "Yape → Efectivo" : "Efectivo → Yape"}</span></td>
                        <td>{op.customer_name ?? "—"}</td>
                        <td>{op.reference_code ?? "—"}</td>
                        <td>{currency(op.amount)}</td>
                        <td>{currency(op.commission)}</td>
                        <td>{currency(op.net_amount)}</td>
                        <td><span className={`status ${op.status === "COMPLETED" ? "ok" : "pending"}`}><i />{op.status === "COMPLETED" ? "Completada" : "En proceso"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card checklist">
              <div className="card-head">
                <div>
                  <strong>Checklist de caja</strong>
                  <span>Hoy</span>
                </div>
                <Settings2 size={17} className="muted" />
              </div>
              {[
                ["Caja abierta", Boolean(dashboard?.session)],
                ["Registrar operaciones", (dashboard?.metrics.operationsToday ?? 0) > 0],
                ["Verificar comprobantes", true],
                ["Revisar diferencia de caja", true],
                ["Cierre diario", false]
              ].map(([label, done]) => (
                <div className="check-row" key={String(label)}>
                  <span className={done ? "check done" : "check"}>{done && <Check size={13} />}</span>
                  <div><strong>{String(label)}</strong><span>{done ? "Completado" : "Pendiente al final del día"}</span></div>
                </div>
              ))}
              <button className="close-day"><LockKeyhole size={17} /> Cerrar caja</button>
            </section>
          </div>
        </section>
      </main>

      {modalOpen && (
        <OperationModal
          settings={settings}
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Kpi({ icon, tone, label, value, hint, positive }: { icon: React.ReactNode; tone: string; label: string; value: string; hint: string; positive?: boolean }) {
  return (
    <section className="card kpi">
      <div className={`kpi-icon ${tone}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={positive ? "positive" : ""}>{positive ? "✓ " : ""}{hint}</small>
    </section>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="summary-row">
      <span className="summary-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OperationModal({ settings, onClose, onCreated }: { settings: Settings | null; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<"YAPE_TO_CASH" | "CASH_TO_YAPE">("YAPE_TO_CASH");
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
      const response = await fetch("/api/branches/1/operations", {
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
          <div>
            <h2>Nueva operación</h2>
            <p>La comisión se calcula automáticamente.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={19} /></button>
        </div>

        <label>Tipo de operación</label>
        <div className="operation-types">
          <button type="button" className={type === "YAPE_TO_CASH" ? "selected yape" : ""} onClick={() => setType("YAPE_TO_CASH")}><Smartphone size={19} /> Yape → Efectivo</button>
          <button type="button" className={type === "CASH_TO_YAPE" ? "selected cash" : ""} onClick={() => setType("CASH_TO_YAPE")}><Send size={19} /> Efectivo → Yape</button>
        </div>

        <div className="field-grid">
          <label>Monto
            <div className="input-prefix"><span>S/</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" required /></div>
            <small>Máximo actual: {currency(settings?.max_operation_amount ?? 50)}</small>
          </label>
          <label>Código / referencia
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. 850421" required={type === "YAPE_TO_CASH"} />
            <small>{type === "YAPE_TO_CASH" ? "Obligatorio para Yape → Efectivo" : "Opcional"}</small>
          </label>
        </div>

        <label>Cliente
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nombre opcional" />
        </label>

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

export default App;
