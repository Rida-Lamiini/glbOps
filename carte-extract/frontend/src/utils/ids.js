const suffix = (id) => {
  const n = parseInt(String(id).split("-").pop(), 10);
  return Number.isFinite(n) ? n : 0;
};

// Highest numeric suffix + 1, so an id is never reused after a deletion or a gap.
const nextSeq = (list) => list.reduce((max, it) => Math.max(max, suffix(it.id)), 0) + 1;
export const nextEmployeeId = (list) => `EMP-${String(nextSeq(list)).padStart(3, "0")}`;
export const nextMaterielId = (list) => `MAT-${String(nextSeq(list)).padStart(3, "0")}`;
export const nextVehiculeId = (list) => `VEH-${String(nextSeq(list)).padStart(3, "0")}`;
// Conge.id is a real, globally unique primary key on the server (not scoped per employee), so
// the employee id has to be part of it — a bare per-employee counter would let two different
// employees' first congé both mint "CNG-001" and collide once persisted. Highest suffix + 1
// rather than a count, so deleting a congé never makes the next one reuse a live id.
export const nextCongeId = (employeeId, conges) =>
  `CNG-${employeeId}-${String((conges || []).reduce((max, c) => Math.max(max, suffix(c.id)), 0) + 1).padStart(3, "0")}`;

// Client ids ("CLI-0231") carry no year: the counter runs over every id ever issued.
export const lastNumber = (ids) => ids.reduce((max, id) => Math.max(max, suffix(id)), 0);
export const clientId = (n) => `CLI-${String(n).padStart(4, "0")}`;

// Projet and prestation ids ("PRJ-2026-008", "PRS-2026-107") embed the year and their counter
// restarts each January, so the highest number is looked up among that year's ids only.
export const currentYear = () => new Date().getFullYear();
export const lastNumberOfYear = (ids, year) => lastNumber(ids.filter((id) => String(id).split("-")[1] === String(year)));
export const projetId = (year, n) => `PRJ-${year}-${String(n).padStart(3, "0")}`;
export const prestationId = (year, n) => `PRS-${year}-${String(n).padStart(3, "0")}`;
