// Calendario gregoriano, independiente de la zona horaria y de servicios externos.
import { validHighlightColor, MARK_LIMIT } from "./formatting.js";
export const MONTHS = Object.freeze([
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]);
export const WEEKDAYS = Object.freeze(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);

export function validPeriod(year, month) {
  return Number.isInteger(year) && year >= 1 && year <= 9999 &&
    Number.isInteger(month) && month >= 1 && month <= 12;
}

export function validDay(year, month, day) {
  if (!validPeriod(year, month) || !Number.isInteger(day) || day < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return day <= date.getUTCDate();
}

export function validateDayHighlights(highlights = []) {
  const dates = new Set();
  if (!Array.isArray(highlights) || highlights.length > MARK_LIMIT) throw new Error("El remarcado del calendario no es válido.");
  for (const mark of highlights) {
    const date = `${mark?.year}-${mark?.month}-${mark?.day}`;
    if (!mark || !validDay(mark.year, mark.month, mark.day) || !validHighlightColor(mark.color) || dates.has(date)) {
      throw new Error("El remarcado del calendario no es válido.");
    }
    dates.add(date);
  }
}

export function calendarWeeks(year, month) {
  if (!validPeriod(year, month)) throw new Error("Elegí un mes y un año entre 1 y 9999.");
  // setUTCFullYear evita que Date convierta los años 1…99 en 1901…1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, 1);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCFullYear(year, month, 0);
  const days = date.getUTCDate();
  return Array.from({ length: Math.ceil((offset + days) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - offset + 1;
      return day >= 1 && day <= days ? day : null;
    }));
}
