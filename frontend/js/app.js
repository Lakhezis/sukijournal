// Punto de entrada ES Module. La primera etapa presenta una hoja vacía.
// El estado del journal y la persistencia se incorporarán en las etapas siguientes.
const workspace = document.querySelector("#workspace");
const page = document.querySelector("#journal-page");
const status = document.querySelector("#app-status");

if (!workspace || !page || !status) {
  throw new Error("No se encontró la superficie del journal.");
}

status.textContent = "Vista inicial";
console.info("Suki Journal: interfaz inicial lista.");
