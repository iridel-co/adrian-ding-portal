const CENTAVOS_PER_PESO = 100;

const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

/* "₱6,500" for display. */
export function formatPesos(centavos: number) {
  return pesoFormat.format(centavos / CENTAVOS_PER_PESO);
}

/* "6500" or "6500.50" for an input field. */
export function centavosToPesoInput(centavos: number | null) {
  if (centavos === null) return "";

  const pesos = centavos / CENTAVOS_PER_PESO;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

/* Whole centavos from typed pesos. Null when empty or not a valid amount. */
export function pesoInputToCentavos(input: string) {
  const cleaned = input.replace(/[₱,\s]/g, "");
  if (cleaned === "") return null;

  const pesos = Number(cleaned);
  if (!Number.isFinite(pesos) || pesos < 0) return null;

  return Math.round(pesos * CENTAVOS_PER_PESO);
}
