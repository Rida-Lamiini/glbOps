export const nextClientId = (clients) => `CLI-0${240 + clients.length}`;
// Highest numeric suffix + 1, so an id is never reused after a deletion or a gap.
const nextSeq = (list) => list.reduce((max, it) => Math.max(max, parseInt(String(it.id).split("-").pop(), 10) || 0), 0) + 1;
export const nextEmployeeId = (list) => `EMP-${String(nextSeq(list)).padStart(3, "0")}`;
export const nextMaterielId = (list) => `MAT-${String(nextSeq(list)).padStart(3, "0")}`;
export const nextVehiculeId = (list) => `VEH-${String(nextSeq(list)).padStart(3, "0")}`;
// Scoped to one employee's own conges list (not global), matched by employeeId + congeId
// together everywhere it's read, so a per-employee counter is safe and collision-free.
export const nextCongeId = (conges) => `CNG-${String((conges || []).length + 1).padStart(3, "0")}`;

export const nextPrestationId = (projets) => {
  let max = 0;
  projets.forEach((pr) => {
    pr.prestations.forEach((p) => {
      const n = parseInt(String(p.id).split("-").pop(), 10);
      if (Number.isFinite(n) && n > max) max = n;
    });
  });
  return `PRS-2026-${max + 1}`;
};
