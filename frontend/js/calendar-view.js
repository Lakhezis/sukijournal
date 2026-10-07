import { MONTHS, WEEKDAYS, calendarWeeks } from "./calendar.js";
import { HIGHLIGHT_COLORS } from "./formatting.js";

export function fillMonths(select) {
  MONTHS.forEach((label, index) => {
    const option = document.createElement("option");
    option.value = index + 1;
    option.textContent = label;
    select.append(option);
  });
}

export function createCalendarView(onChange, onDay = () => {}) {
  const node = document.createElement("div");
  node.className = "calendar-content";
  const fields = document.createElement("div");
  fields.className = "calendar-period";
  const month = document.createElement("select");
  month.className = "calendar-month";
  month.setAttribute("aria-label", "Mes del calendario");
  fillMonths(month);
  const year = document.createElement("input");
  year.className = "calendar-year";
  year.type = "number";
  year.min = "1";
  year.max = "9999";
  year.step = "1";
  year.required = true;
  year.setAttribute("aria-label", "Año del calendario");
  fields.append(month, year);
  const table = document.createElement("table");
  table.className = "calendar-table";
  const caption = document.createElement("caption");
  const head = document.createElement("thead");
  const weekdays = document.createElement("tr");
  WEEKDAYS.forEach(label => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label.slice(0, 3);
    cell.setAttribute("abbr", label);
    weekdays.append(cell);
  });
  head.append(weekdays);
  const body = document.createElement("tbody");
  table.append(caption, head, body);
  node.append(fields, table);
  let current = null;
  let ready = false;
  let highlighting = false;
  let focusedDay = 1;
  function renderDays() {
    node.classList.toggle("is-highlighting", highlighting);
    for (const button of body.querySelectorAll(".calendar-day")) {
      const day = Number(button.dataset.day);
      const mark = current.dayHighlights?.find(mark => mark.year === current.year && mark.month === current.month && mark.day === day);
      button.disabled = !ready;
      button.tabIndex = ready && highlighting && day === focusedDay ? 0 : -1;
      button.setAttribute("aria-pressed", String(Boolean(mark)));
      if (mark) button.dataset.highlightColor = mark.color;
      else delete button.dataset.highlightColor;
      const date = `${day} de ${MONTHS[current.month - 1]} de ${current.year}`;
      button.setAttribute("aria-label", `${date}${mark ? `, remarcado ${HIGHLIGHT_COLORS.find(color => color.value === mark.color).label.toLowerCase()}` : ""}`);
      button.title = highlighting ? "Remarcar o quitar el remarcado con el color elegido" : "Seleccionar día; elegí Remarcado para destacarlo";
    }
  }
  function commit() {
    if (ready && year.checkValidity()) onChange(year.valueAsNumber, Number(month.value));
  }
  month.addEventListener("change", commit);
  year.addEventListener("change", () => { if (!year.reportValidity()) return; commit(); });
  year.addEventListener("blur", () => {
    if (!year.checkValidity() && current) year.value = current.year;
  });
  return { node,
    setHighlighting(value) { highlighting = value; if (current) renderDays(); },
    finish() { commit(); if (current) { year.value = current.year; month.value = current.month; } },
    render(element, editable) {
      ready = editable;
      month.disabled = year.disabled = !ready;
      const samePeriod = current?.year === element.year && current?.month === element.month;
      current = element;
      if (samePeriod) { renderDays(); return; }
      focusedDay = 1;
      month.value = element.month;
      year.value = element.year;
      caption.textContent = `${MONTHS[element.month - 1]} ${element.year}`;
      body.replaceChildren();
      for (const week of calendarWeeks(element.year, element.month)) {
        const row = document.createElement("tr");
        for (const day of week) {
          const cell = document.createElement("td");
          if (day) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "calendar-day";
            button.dataset.day = day;
            button.textContent = day;
            button.addEventListener("click", () => { if (ready) { focusedDay = day; renderDays(); onDay(day); } });
            button.addEventListener("keydown", event => {
              const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
              if (!highlighting || (offset === undefined && !["Home", "End"].includes(event.key))) return;
              event.preventDefault();
              const days = body.querySelectorAll(".calendar-day").length;
              focusedDay = event.key === "Home" ? 1 : event.key === "End" ? days : Math.max(1, Math.min(days, day + offset));
              renderDays();
              body.querySelector(`[data-day="${focusedDay}"]`).focus({ preventScroll: true });
            });
            cell.append(button);
          }
          row.append(cell);
        }
        body.append(row);
      }
      renderDays();
    },
  };
}
