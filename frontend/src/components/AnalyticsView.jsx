import React, { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { STAGES, STAGE_COLORS } from "../constants";
import { parseDateFR } from "../utils/dates";
import { listCadastreLots } from "./cadastre/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const DAY = 86400000;
const PERIODS = [
  { value: "3", label: "3 mois", months: 3 },
  { value: "6", label: "6 mois", months: 6 },
  { value: "12", label: "12 mois", months: 12 },
  { value: "all", label: "Tout", months: 0 },
];

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

function Kpi({ label, value, hint, tone }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-[11px] font-semibold uppercase tracking-wider">{label}</CardDescription>
        <CardTitle className="font-[var(--font-display)] text-4xl font-semibold" style={tone ? { color: tone } : undefined}>
          {value}
        </CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function ChartCard({ title, description, empty, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-[var(--font-display)] text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {empty ? (
          <Empty className="min-h-[200px]">
            <EmptyHeader>
              <EmptyTitle>Pas encore de données</EmptyTitle>
              <EmptyDescription>{empty}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsView({ projets, employees, getClient }) {
  const [period, setPeriod] = useState("6");
  const [clientId, setClientId] = useState("all");
  const [lots, setLots] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listCadastreLots().then((l) => !cancelled && setLots(l)).catch(() => !cancelled && setLots([]));
    return () => { cancelled = true; };
  }, []);

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

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 pb-16 pt-6 md:px-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Suivi</div>
          <h1 className="m-0 font-[var(--font-display)] text-3xl font-semibold tracking-tight">Analytique</h1>
          <p className="m-0 mt-1 max-w-[60ch] text-sm text-muted-foreground">
            Volumes, délais, qualité et charge d'équipe, calculés sur les prestations de la période choisie.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" variant="outline" value={period} onValueChange={(v) => v && setPeriod(v)} aria-label="Période">
            {PERIODS.map((p) => (
              <ToggleGroupItem key={p.value} value={p.value}>{p.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-[190px]" aria-label="Client">
              <SelectValue placeholder="Tous les clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Tous les clients</SelectItem>
                {[...new Set(projets.map((p) => p.clientId))].map((id) => (
                  <SelectItem key={id} value={id}>{getClient(id)?.nom || id}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs clés">
        <Kpi label="Prestations" value={kpi.total} hint={`${kpi.total - kpi.livrees} en cours ou en attente`} />
        <Kpi label="Taux de livraison" value={`${kpi.tauxLivraison}%`} hint={`${kpi.livrees} livrée${kpi.livrees > 1 ? "s" : ""}`} tone="var(--status-success)" />
        <Kpi
          label="Non-conformité"
          value={`${kpi.tauxNonConf}%`}
          hint={`${kpi.nonConf} prestation${kpi.nonConf > 1 ? "s" : ""} renvoyée${kpi.nonConf > 1 ? "s" : ""}`}
          tone={kpi.nonConf ? "var(--status-danger)" : undefined}
        />
        <Kpi label="Délai moyen" value={kpi.delai == null ? "—" : `${kpi.delai} j`} hint="De la demande à la livraison" />
      </section>

      <Tabs defaultValue="activite" className="gap-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="activite">Activité</TabsTrigger>
          <TabsTrigger value="equipe">Équipe</TabsTrigger>
          <TabsTrigger value="qualite">Qualité</TabsTrigger>
          <TabsTrigger value="cadastre">Cadastre</TabsTrigger>
        </TabsList>

        <TabsContent value="activite" className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ChartCard title="Demandes et livraisons" description="Par mois" empty={monthly.length === 0 || (rows.length === 0 && all.length === 0) ? "Aucune prestation datée sur la période." : null}>
              <ChartContainer config={activityConfig} className="aspect-auto h-[260px] w-full">
                <AreaChart data={monthly} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Area dataKey="demandes" type="monotone" fill="var(--color-demandes)" fillOpacity={0.18} stroke="var(--color-demandes)" strokeWidth={2} />
                  <Area dataKey="livraisons" type="monotone" fill="var(--color-livraisons)" fillOpacity={0.18} stroke="var(--color-livraisons)" strokeWidth={2} />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </ChartCard>
          </div>
          <div className="lg:col-span-2">
            <ChartCard title="Où en sont les prestations" description="Répartition par étape du pipeline" empty={rows.length === 0 ? "Aucune prestation sur la période." : null}>
              <ChartContainer config={{ count: { label: "Prestations" } }} className="aspect-auto h-[260px] w-full">
                <BarChart data={byStage} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <CartesianGrid horizontal={false} />
                  <YAxis dataKey="stage" type="category" tickLine={false} axisLine={false} width={118} />
                  <XAxis type="number" allowDecimals={false} hide />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="count" radius={4}>
                    {byStage.map((s) => (
                      <Cell key={s.key} fill={STAGE_COLORS[s.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="equipe" className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Charge de travail" description="Prestations non livrées par agent, selon son rôle" empty={workload.length === 0 ? "Aucune prestation affectée." : null}>
            <ChartContainer config={workloadConfig} className="aspect-auto h-[300px] w-full">
              <BarChart data={workload} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={110} />
                <XAxis type="number" allowDecimals={false} hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="chantier" stackId="a" fill="var(--color-chantier)" />
                <Bar dataKey="bureau" stackId="a" fill="var(--color-bureau)" />
                <Bar dataKey="controle" stackId="a" fill="var(--color-controle)" radius={[0, 4, 4, 0]} />
                <ChartLegend content={<ChartLegendContent />} />
              </BarChart>
            </ChartContainer>
          </ChartCard>
          <Card>
            <CardHeader>
              <CardTitle className="font-[var(--font-display)] text-lg">Effectif</CardTitle>
              <CardDescription>Statut des {employees.length} collaborateurs</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {["Agent Chantier", "Agent Bureau", "Agent Contrôle", "Dispatcher", "Directrice"].map((role) => {
                const n = employees.filter((e) => e.role === role).length;
                return n ? <Badge key={role} variant="secondary">{role} · {n}</Badge> : null;
              })}
              <Badge variant="outline">En congé · {employees.filter((e) => e.status && e.status !== "actif").length}</Badge>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qualite" className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Non-conformité par nature" description="Part de prestations renvoyées en exécution" empty={byNature.length === 0 ? "Aucune prestation sur la période." : null}>
            <ChartContainer config={{ taux: { label: "Taux (%)", color: "var(--bad)" } }} className="aspect-auto h-[280px] w-full">
              <BarChart data={byNature} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="nature" type="category" tickLine={false} axisLine={false} width={130} />
                <XAxis type="number" domain={[0, 100]} hide />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="taux" fill="var(--color-taux)" radius={4} />
              </BarChart>
            </ChartContainer>
          </ChartCard>
          <ChartCard title="Prestations à surveiller" description="Renvois répétés en exécution" empty={nonConformes.length === 0 ? "Aucune non-conformité sur la période." : null}>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {nonConformes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.natureDemandee || "Non définie"}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.id} · {getClient(p.projet.clientId)?.nom}</div>
                  </div>
                  <Badge variant="destructive">×{p.cycles}</Badge>
                </li>
              ))}
            </ul>
          </ChartCard>
        </TabsContent>

        <TabsContent value="cadastre" className="grid gap-4 lg:grid-cols-5">
          {lots === null ? (
            <Skeleton className="h-[320px] lg:col-span-5" />
          ) : (
            <>
              <div className="lg:col-span-2">
                <ChartCard title="Conformité des lots" description="Écart de surface ≤ 1 m²" empty={lotData.length === 0 ? "Aucun lot enregistré dans Cadastre." : null}>
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
                        innerRadius={62}
                        strokeWidth={3}
                      />
                      <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                    </PieChart>
                  </ChartContainer>
                </ChartCard>
              </div>
              <div className="lg:col-span-3">
                <ChartCard title="Écart de surface par lot" description="Surface calculée + correction − surface du document (m²)" empty={lotData.length === 0 ? "Aucun lot enregistré dans Cadastre." : null}>
                  <ChartContainer config={{ ecart: { label: "Écart (m²)", color: "var(--accent)" } }} className="aspect-auto h-[240px] w-full">
                    <BarChart data={lotData} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis tickLine={false} axisLine={false} width={40} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="ecart" radius={4}>
                        {lotData.map((l) => (
                          <Cell key={l.name} fill={l.conforme ? "var(--good)" : "var(--bad)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </ChartCard>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
