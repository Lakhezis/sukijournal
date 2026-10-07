// Dibujos SVG propios y locales; el journal guarda solo la clave del catálogo.
export const STAMPS = Object.freeze([
  { value: "flower", label: "Flor" }, { value: "leaf", label: "Brote" },
  { value: "star", label: "Estrella" }, { value: "heart", label: "Corazón" },
  { value: "rainbow", label: "Arcoíris" }, { value: "moon", label: "Luna" },
].map(stamp => Object.freeze({ ...stamp, src: `assets/stamps/${stamp.value}.svg` })));

export const findStamp = value => STAMPS.find(stamp => stamp.value === value);
