import { MONTHS, WEEKDAYS, calendarWeeks } from "./calendar.js";

export function fillMonths(select) {
  MONTHS.forEach((label, index) => {
    const option = document.createElement("option");
    option.value = index + 1;
    option.textContent = label;
    select.append(option);
  });
}

export function createCalendarView(onChange) {
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
  function commit() {
    if (ready && year.checkValidity()) onChange(year.valueAsNumber, Number(month.value));
  }
  month.addEventListener("change", commit);
  year.addEventListener("change", () => { if (!year.reportValidity()) return; commit(); });
  year.addEventListener("blur", () => {
    if (!year.checkValidity() && current) year.value = current.year;
  });
  return { node,
    finish() { commit(); if (current) { year.value = current.year; month.value = current.month; } },
    render(element, editable) {
      ready = editable;
      month.disabled = year.disabled = !ready;
      if (current?.year === element.year && current?.month === element.month) return;
      current = { year: element.year, month: element.month };
      month.value = element.month;
      year.value = element.year;
      caption.textContent = `${MONTHS[element.month - 1]} ${element.year}`;
      body.replaceChildren();
      for (const week of calendarWeeks(element.year, element.month)) {
        const row = document.createElement("tr");
        for (const day of week) {
          const cell = document.createElement("td");
          cell.textContent = day ?? "";
          row.append(cell);
        }
        body.append(row);
      }
    },
  };
}
