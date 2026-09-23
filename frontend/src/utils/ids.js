// Highest numeric suffix + 1, so an id is never reused after a deletion or a gap.
const nextSeq = (list) => list.reduce((max, it) => Math.max(max, parseInt(String(it.id).split("-").pop(), 10) || 0), 0) + 1;
export const nextClientId = (clients) => `CLI-${String(nextSeq(clients)).padStart(4, "0")}`;
export const nextEmployeeId = (list) => `EMP-${String(nextSeq(list)).padStart(3, "0")}`;
export const nextMaterielId = (list) => `MAT-${String(nextSeq(list)).padStart(3, "0")}`;
export const nextVehiculeId = (list) => `VEH-${String(nextSeq(list)).padStart(3, "0")}`;
// Conge.id is a real, globally unique primary key on the server (not scoped per employee), so
// the employee id has to be part of it — a bare per-employee counter would let two different
// employees' first congé both mint "CNG-001" and collide once persisted.
export const nextCongeId = (employeeId, conges) => `CNG-${employeeId}-${String((conges || []).length + 1).padStart(3, "0")}`;

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
