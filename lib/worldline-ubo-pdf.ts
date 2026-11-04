import { PDFCheckBox, PDFName, type PDFDocument } from "pdf-lib";
import type { UboPrefill } from "./worldline-ubo";

export function fillUboPdf(pdf: PDFDocument, prefill: UboPrefill) {
  const form = pdf.getForm();
  // Do not inherit preselected attachment declarations from the blank template.
  for (const field of form.getFields()) if (field instanceof PDFCheckBox) field.uncheck();
  for (const [name, value] of Object.entries(prefill.text)) {
    const field = form.getTextField(name);
    field.setText(value);
    field.setFontSize(8);
  }
  for (const [name, value] of Object.entries(prefill.checks)) {
    const field = form.getCheckBox(name);
    // Several template checkboxes share one field but have distinct export values.
    // check() would select the first widget (and can mark the wrong ownership type).
    const onValue = value === "Yes" ? field.acroField.getWidgets()[0].getOnValue() : PDFName.of(value);
    if (onValue) field.acroField.setValue(onValue);
  }
}
