import React from "react";
import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";

// Deterministic blob face seeded by the person's name: the same name always gets the same face.
export default function PersonAvatar({ name, size = 38, className = "" }) {
  return (
    <span className={`gt-person-avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Blobatar name={name || "?"} animate="hover" size={size} />
    </span>
  );
}
