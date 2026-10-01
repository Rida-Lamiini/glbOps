export function bookingsFromProjets(projets) {
  const rows = [];
  projets.forEach((pr) => {
    pr.prestations.forEach((p) => {
      if (p.dateDebutExec) rows.push({ prestation: p, projet: pr });
    });
  });
  return rows;
}

export function groupBookingsByDate(bookings) {
  const map = {};
  bookings.forEach((b) => {
    const key = b.prestation.dateDebutExec;
    if (!map[key]) map[key] = [];
    map[key].push(b);
  });
  return map;
}

// Only a prestation whose field visit hasn't happened yet (or is currently underway) can
// actually collide with a new assignment on the same day — once it's moved on to bureau/
// contrôle/livraison, the agent/vehicle is free again and the date is just a historical record.
const ACTIVE_BOOKING_STAGES = new Set(["affectation", "execution"]);
const isActiveBooking = (prestation) => ACTIVE_BOOKING_STAGES.has(prestation.stage);

export function conflictingIds(dayBookings) {
  const ids = new Set();
  for (let i = 0; i < dayBookings.length; i++) {
    for (let j = i + 1; j < dayBookings.length; j++) {
      const a = dayBookings[i].prestation;
      const b = dayBookings[j].prestation;
      if (a.id === b.id) continue;
      if (!isActiveBooking(a) || !isActiveBooking(b)) continue;
      const sameVehicule = a.vehiculeId && a.vehiculeId === b.vehiculeId;
      const sameAgent = (a.agentChantier || []).some((n) => (b.agentChantier || []).includes(n));
      if (sameVehicule || sameAgent) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return ids;
}

export function findDraftConflicts(bookingsForDate, { excludePrestationId, vehiculeId, agentNames }) {
  const conflicts = [];
  bookingsForDate.forEach(({ prestation, projet }) => {
    if (prestation.id === excludePrestationId) return;
    if (!isActiveBooking(prestation)) return;
    if (vehiculeId && prestation.vehiculeId === vehiculeId) {
      conflicts.push({ type: "vehicule", prestation, projet });
    }
    (agentNames || []).forEach((name) => {
      if ((prestation.agentChantier || []).includes(name)) {
        conflicts.push({ type: "agent", agentName: name, prestation, projet });
      }
    });
  });
  return conflicts;
}
