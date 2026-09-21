import React, { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { STAGES, STAGE_COLORS } from "../constants";
import { parseDateFR, activeCongeOn, today } from "../utils/dates";
import { listCadastreLots } from "./cadastre/api";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, Loader2 } from "lucide-react";
import { generateMonthlyReport, monthLabelFR, reportMonths } from "../utils/reportMonthly";
import { notifyError, notifySuccess } from "../utils/notify";

const DAY = 86400000;
const PERIODS = [
  { value: "3", label: "3 mois", months: 3 },
  { value: "6", label: "6 mois", months: 6 },
  { value: "12", label: "12 mois", months: 12 },
  { value: "all", label: "Tout", months: 0 },
];
const TABS = [
  { value: "activite", label: "Activité" },
  { value: "equipe", label: "Équipe" },
  { value: "qualite", label: "Qualité" },
  { value: "cadastre", label: "Cadastre" },
];
const ROLE_LIST = ["Agent Chantier", "Agent Bureau", "Agent Contrôle", "Dispatcher", "Directrice"];

const monthKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
};
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const isLivree = (p) => p.stage === "livraison" && Boolean(p.chemin);

const AXIS_TICK = { fill: "var(--muted)", fontSize: 11.5 };
const GRID_PROPS = { stroke: "var(--line)", strokeDasharray: "3 4" };

function Panel({ title, description, empty, children, className = "" }) {
  return (
    <section className={`gt-dash-panel an-panel ${className}`}>
      <div className="gt-dash-panel-head an-panel-head">
        <div>
          <span className="gt-dash-panel-title">{title}</span>
          {description && <div className="an-panel-desc">{description}</div>}
        </div>
      </div>
      {empty ? (
        <div className="an-empty">
          <strong>Pas encore de données</strong>
          <span>{empty}</span>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export default function AnalyticsView({ projets, employees, materiels = [], vehicules = [], getClient, author }) {
  const [reportMonth, setReportMonth] = useState(() => reportMonths()[0]);
  const [reporting, setReporting] = useState(false);
  const [period, setPeriod] = useState("6");
  const [clientId, setClientId] = useState("all");
  const [tab, setTab] = useState("activite");
  const [lots, setLots] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listCadastreLots().then((l) => !cancelled && setLots(l)).catch(() => !cancelled && setLots([]));
    return () => { cancelled = true; };
  }, []);

  const makeReport = async () => {
    setReporting(true);
    try {
      await generateMonthlyReport({ monthKey: reportMonth, projets, employees, materiels, vehicules, lots, getClient, author });
      notifySuccess("Rapport de direction généré");
    } catch {
      notifyError("Le rapport n'a pas pu être généré.");
    } finally {
      setReporting(false);
    }
  };

  const range = PERIODS.find((p) => p.value === period);

  const all = useMemo(
    () =>
      projets
        .filter((pr) => clientId === "all" || pr.clientId === clientId)
        .flatMap((pr) => pr.prestations.map((p) => ({ ...p, projet: pr, start: parseDateFR(p.dateDebutDemande), end: parseDateFR(p.dateLivraison) }))),
    [projets, clientId],
  );

  const now = Date.now();
  const startBound = useMemo(() => {
    if (!range.months) return null;
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth() - (range.months - 1), 1).getTime();
  }, [range.months, now]);

  // A prestation belongs to the period by its request date; undated ones only count under "Tout".
  const rows = useMemo(() => all.filter((p) => (startBound == null ? true : p.start != null && p.start >= startBound)), [all, startBound]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const livrees = rows.filter(isLivree);
    const nonConf = rows.filter((p) => p.cycles > 0).length;
    const delays = livrees.filter((p) => p.start != null && p.end != null).map((p) => (p.end - p.start) / DAY);
    return {
      total,
      livrees: livrees.length,
      tauxLivraison: pct(livrees.length, total),
      nonConf,
      tauxNonConf: pct(nonConf, total),
      delai: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
    };
  }, [rows]);

  const monthly = useMemo(() => {
    const dated = all.flatMap((p) => [p.start, p.end]).filter((t) => t != null);
    const first = startBound ?? (dated.length ? Math.min(...dated) : now);
    const keys = [];
    const cursor = new Date(first);
    cursor.setDate(1);
    const last = new Date(now);
    while (cursor <= last) {
      keys.push(monthKey(cursor.getTime()));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const map = Object.fromEntries(keys.map((k) => [k, { key: k, month: monthLabel(k), demandes: 0, livraisons: 0 }]));
    all.forEach((p) => {
      if (p.start != null && map[monthKey(p.start)]) map[monthKey(p.start)].demandes += 1;
      if (p.end != null && map[monthKey(p.end)]) map[monthKey(p.end)].livraisons += 1;
    });
    return keys.map((k) => map[k]);
  }, [all, startBound, now]);

  const byStage = useMemo(
    () => STAGES.map((s) => ({ stage: s.label, key: s.key, count: rows.filter((p) => p.stage === s.key).length })),
    [rows],
  );

  const byNature = useMemo(() => {
    const m = {};
    rows.forEach((p) => {
      const k = p.natureDemandee || "Non définie";
      m[k] = m[k] || { nature: k, total: 0, nonConf: 0 };
      m[k].total += 1;
      if (p.cycles > 0) m[k].nonConf += 1;
    });
    return Object.values(m)
      .map((n) => ({ ...n, taux: pct(n.nonConf, n.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [rows]);

  const workload = useMemo(() => {
    const m = {};
    const bump = (name, role) => {
      if (!name) return;
      m[name] = m[name] || { name, chantier: 0, bureau: 0, controle: 0 };
      m[name][role] += 1;
    };
    rows.filter((p) => !isLivree(p)).forEach((p) => {
      (p.agentChantier || []).forEach((n) => bump(n, "chantier"));
      bump(p.agentBureau, "bureau");
      bump(p.agentControle, "controle");
    });
    return Object.values(m).sort((a, b) => b.chantier + b.bureau + b.controle - (a.chantier + a.bureau + a.controle)).slice(0, 8);
  }, [rows]);

  const nonConformes = useMemo(() => rows.filter((p) => p.cycles > 0).sort((a, b) => b.cycles - a.cycles).slice(0, 6), [rows]);

  const staff = useMemo(() => {
    const todayKey = today();
    return {
      actifs: employees.filter((e) => (e.status || "actif") === "actif").length,
      inactifs: employees.filter((e) => (e.status || "actif") !== "actif").length,
      conge: employees.filter((e) => activeCongeOn(e.conges, todayKey)).length,
      roles: ROLE_LIST.map((role) => ({ role, n: employees.filter((e) => e.role === role).length })).filter((r) => r.n > 0),
    };
  }, [employees]);

  const lotData = useMemo(
    () =>
      (lots || []).map((l) => ({
        name: l.titreFoncier,
        titre: l.proprieteDite,
        ecart: Math.round((l.surfaceCalculeeM2 + l.correctionLambertM2 - l.surfaceDocumentM2) * 100) / 100,
        conforme: l.conforme,
      })),
    [lots],
  );
  const lotsConformes = lotData.filter((l) => l.conforme).length;

  const activityConfig = { demandes: { label: "Demandes", color: "var(--accent)" }, livraisons: { label: "Livraisons", color: "var(--teal)" } };
  const workloadConfig = {
    chantier: { label: "Chantier", color: "var(--amber)" },
    bureau: { label: "Bureau", color: "var(--teal)" },
    controle: { label: "Contrôle", color: "var(--violet)" },
  };

  const noData = rows.length === 0 ? "Aucune prestation sur la période." : null;

  return (
    <div className="an">
      <header className="an-head">
        <div>
          <span className="cv-eyebrow">Suivi</span>
          <h1>Analytique</h1>
          <p>Volumes, délais, qualité et charge d'équipe, calculés sur les prestations de la période choisie.</p>
        </div>
        <div className="an-controls">
          <div className="rg-seg" role="group" aria-label="Période">
            {PERIODS.map((p) => (
              <button key={p.value} type="button" className={period === p.value ? "is-on" : ""} onClick={() => setPeriod(p.value)}>{p.label}</button>
            ))}
          </div>
          <label className="rg-sort">
            <span>Client</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
              <option value="all">Tous les clients</option>
              {[...new Set(projets.map((p) => p.clientId))].map((id) => (
                <option key={id} value={id}>{getClient(id)?.nom || id}</option>
              ))}
            </select>
          </label>
          <div className="an-report">
            <select value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} aria-label="Mois du rapport">
              {reportMonths().map((k) => <option key={k} value={k}>{monthLabelFR(k)}</option>)}
            </select>
            <button type="button" onClick={makeReport} disabled={reporting}>
              {reporting ? <Loader2 size={14} className="gt-spin-icon" /> : <FileDown size={14} />} Rapport de direction
            </button>
          </div>
        </div>
      </header>

      <section className="rg-ledger an-ledger" aria-label="Indicateurs clés">
        <div className="rg-ledger-cell">
          <span>Prestations</span>
          <strong>{kpi.total}</strong>
          <small>{kpi.total - kpi.livrees} en cours ou en attente</small>
        </div>
        <div className="rg-ledger-cell is-ok">
          <span>Taux de livraison</span>
          <strong>{kpi.tauxLivraison}<i>%</i></strong>
          <small>{kpi.livrees} livrée{kpi.livrees > 1 ? "s" : ""}</small>
        </div>
        <div className={`rg-ledger-cell ${kpi.nonConf ? "is-bad" : ""}`}>
          <span>Non-conformité</span>
          <strong className={kpi.nonConf ? "" : "is-zero"}>{kpi.tauxNonConf}<i>%</i></strong>
          <small>{kpi.nonConf} prestation{kpi.nonConf > 1 ? "s" : ""} renvoyée{kpi.nonConf > 1 ? "s" : ""}</small>
        </div>
        <div className="rg-ledger-cell">
          <span>Délai moyen</span>
          <strong className={kpi.delai == null ? "is-zero" : ""}>{kpi.delai == null ? "—" : kpi.delai}{kpi.delai != null && <i> j</i>}</strong>
          <small>de la demande à la livraison</small>
        </div>
      </section>

      <div className="rg-seg an-tabs" role="tablist" aria-label="Rubrique">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={tab === t.value ? "is-on" : ""} onClick={() => setTab(t.value)}>{t.label}</button>
        ))}
      </div>

      {tab === "activite" && (
        <div className="an-grid an-grid-5">
          <Panel className="an-span-3" title="Demandes et livraisons" description="Par mois" empty={monthly.length === 0 || (rows.length === 0 && all.length === 0) ? "Aucune prestation datée sur la période." : null}>
            <ChartContainer config={activityConfig} className="aspect-auto h-[270px] w-full">
              <AreaChart data={monthly} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="an-g-dem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-demandes)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-demandes)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="an-g-liv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-livraisons)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-livraisons)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} {...GRID_PROPS} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={AXIS_TICK} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Area dataKey="demandes" type="monotone" fill="url(#an-g-dem)" stroke="var(--color-demandes)" strokeWidth={2.5} />
                <Area dataKey="livraisons" type="monotone" fill="url(#an-g-liv)" stroke="var(--color-livraisons)" strokeWidth={2.5} />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          </Panel>
          <Panel className="an-span-2" title="Où en sont les prestations" description="Répartition par étape du pipeline" empty={noData}>
            <ChartContainer config={{ count: { label: "Prestations" } }} className="aspect-auto h-[270px] w-full">
              <BarChart data={byStage} layout="vertical" margin={{ left: 0, right: 16 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} {...GRID_PROPS} />
                <YAxis dataKey="stage" type="category" tickLine={false} axisLine={false} width={150} tick={{ ...AXIS_TICK, fill: "var(--ink)" }} />
                <XAxis type="number" allowDecimals={false} hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} minPointSize={3} label={{ position: "right", fill: "var(--ink)", fontSize: 12, fontWeight: 700 }}>
                  {byStage.map((s) => (
                    <Cell key={s.key} fill={STAGE_COLORS[s.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </Panel>
        </div>
      )}

      {tab === "equipe" && (
        <div className="an-grid an-grid-2">
          <Panel title="Charge de travail" description="Prestations non livrées par agent, selon son rôle" empty={workload.length === 0 ? "Aucune prestation affectée." : null}>
            <ChartContainer config={workloadConfig} className="aspect-auto h-[300px] w-full">
              <BarChart data={workload} layout="vertical" margin={{ left: 0, right: 12 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} {...GRID_PROPS} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={116} tick={{ ...AXIS_TICK, fill: "var(--ink)" }} />
                <XAxis type="number" allowDecimals={false} hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="chantier" stackId="a" fill="var(--color-chantier)" />
                <Bar dataKey="bureau" stackId="a" fill="var(--color-bureau)" />
                <Bar dataKey="controle" stackId="a" fill="var(--color-controle)" radius={[0, 6, 6, 0]} />
                <ChartLegend content={<ChartLegendContent />} />
              </BarChart>
            </ChartContainer>
          </Panel>
          <Panel title="Effectif" description={`${employees.length} collaborateur${employees.length > 1 ? "s" : ""}`}>
            <div className="an-staff-kpis">
              <div><strong style={{ color: "var(--status-success)" }}>{staff.actifs}</strong><span>actifs</span></div>
              <div><strong className={staff.conge ? "" : "is-zero"} style={staff.conge ? { color: "var(--status-warning)" } : undefined}>{staff.conge}</strong><span>en congé aujourd'hui</span></div>
              <div><strong className={staff.inactifs ? "" : "is-zero"}>{staff.inactifs}</strong><span>inactif{staff.inactifs > 1 ? "s" : ""}</span></div>
            </div>
            <ul className="an-list">
              {staff.roles.map(({ role, n }) => (
                <li key={role}>
                  <span className="an-list-name">{role}</span>
                  <span className="an-bar"><i style={{ width: `${pct(n, employees.length)}%` }} /></span>
                  <b>{n}</b>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {tab === "qualite" && (
        <div className="an-grid an-grid-2">
          <Panel title="Non-conformité par nature" description="Part de prestations renvoyées en exécution" empty={byNature.length === 0 ? "Aucune prestation sur la période." : null}>
            <ChartContainer config={{ taux: { label: "Taux (%)", color: "var(--bad)" } }} className="aspect-auto h-[280px] w-full">
              <BarChart data={byNature} layout="vertical" margin={{ left: 0, right: 34 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} {...GRID_PROPS} />
                <YAxis dataKey="nature" type="category" tickLine={false} axisLine={false} width={190} tick={{ ...AXIS_TICK, fill: "var(--ink)" }} />
                <XAxis type="number" domain={[0, 100]} hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="taux" fill="var(--color-taux)" radius={[0, 6, 6, 0]} minPointSize={3} label={{ position: "right", fill: "var(--ink)", fontSize: 12, fontWeight: 700, formatter: (v) => `${v}%` }} />
              </BarChart>
            </ChartContainer>
          </Panel>
          <Panel title="Prestations à surveiller" description="Renvois répétés en exécution" empty={nonConformes.length === 0 ? "Aucune non-conformité sur la période." : null}>
            <ul className="an-watch">
              {nonConformes.map((p) => (
                <li key={p.id}>
                  <span className="rg-mono" aria-hidden="true">×{p.cycles}</span>
                  <div className="rg-celltext">
                    <span className="rg-cellname">{p.natureDemandee || "Non définie"}</span>
                    <span className="rg-cellsub"><span className="gt-mono">{p.id}</span> · {getClient(p.projet.clientId)?.nom}</span>
                  </div>
                  <span className="gt-status-pill danger">{p.cycles} renvoi{p.cycles > 1 ? "s" : ""}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {tab === "cadastre" && (
        <div className="an-grid an-grid-5">
          {lots === null ? (
            <Skeleton className="h-[320px] an-span-5" />
          ) : (
            <>
              <Panel className="an-span-2" title="Conformité des lots" description="Écart de surface ≤ 1 m²" empty={lotData.length === 0 ? "Aucun lot enregistré dans Cadastre." : null}>
                <ChartContainer
                  config={{ conforme: { label: "Conformes", color: "var(--good)" }, ecart: { label: "Avec écart", color: "var(--bad)" } }}
                  className="mx-auto aspect-square h-[240px]"
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={[
                        { name: "conforme", value: lotsConformes, fill: "var(--color-conforme)" },
                        { name: "ecart", value: lotData.length - lotsConformes, fill: "var(--color-ecart)" },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={66}
                      strokeWidth={3}
                    />
                    <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                  </PieChart>
                </ChartContainer>
              </Panel>
              <Panel className="an-span-3" title="Écart de surface par lot" description="Surface calculée + correction − surface du document (m²)" empty={lotData.length === 0 ? "Aucun lot enregistré dans Cadastre." : null}>
                <ChartContainer config={{ ecart: { label: "Écart (m²)", color: "var(--accent)" } }} className="aspect-auto h-[240px] w-full">
                  <BarChart data={lotData} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid vertical={false} {...GRID_PROPS} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={AXIS_TICK} />
                    <YAxis tickLine={false} axisLine={false} width={40} tick={AXIS_TICK} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="ecart" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {lotData.map((l) => (
                        <Cell key={l.name} fill={l.conforme ? "var(--good)" : "var(--bad)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </Panel>
            </>
          )}
        </div>
      )}
    </div>
  );
}
