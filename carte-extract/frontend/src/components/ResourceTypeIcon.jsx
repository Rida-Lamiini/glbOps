import React from "react";
import { Compass, Satellite, PlaneTakeoff, Scan, GaugeCircle, Truck, Boxes } from "lucide-react";

const ICONS = {
  station_totale: Compass,
  gps: Satellite,
  drone: PlaneTakeoff,
  scanner: Scan,
  niveau: GaugeCircle,
  vehicule: Truck,
  autre: Boxes,
};

export default function ResourceTypeIcon({ type, size = 14, ...props }) {
  const Icon = ICONS[type] || Boxes;
  return <Icon size={size} {...props} />;
}
