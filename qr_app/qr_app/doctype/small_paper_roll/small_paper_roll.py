# Copyright (c) 2025, surani and contributors
# For license information, please see license.txt

import base64
from io import BytesIO

import frappe
import qrcode
from frappe.model.document import Document
from frappe.utils import formatdate


class SmallPaperRoll(Document):
	pass


@frappe.whitelist()
def get_qr_print_html(name: str) -> str:
	doc = frappe.get_doc("Small Paper Roll", name)
	formatted_mfg = (
		formatdate(doc.manufacture_date, "dd-MM-yy") if doc.get("manufacture_date") else None
	)

	label_data = {
		"id": str(doc.name),
	}
	qr_buffer = BytesIO()
	qrcode.make(frappe.as_json(label_data)).save(qr_buffer, format="PNG")
	qr_image = base64.b64encode(qr_buffer.getvalue()).decode()
	display = {
		"width": doc.get_formatted("width_mm") if doc.width_mm else None,
		"length": doc.get_formatted("length_m") if doc.length_m else None,
		"gsm": doc.get_formatted("gsm") if doc.gsm else None,
		"weight": doc.get_formatted("weight_kg") if doc.weight_kg else None,
		"manufacture_date": formatted_mfg,
	}

	parts = []
	if doc.weight_kg:
		weight_g = int(doc.weight_kg * 1000)
		parts.append(f"{weight_g} g")
	if display["gsm"]:
		parts.append(f"{display['gsm']} GSM")
	if display["width"]:
		parts.append(f"{display['width']} mm")
	if display["length"]:
		parts.append(f"{display['length']} m")
	net_text = " | ".join(parts)
	return frappe.render_template(
		"qr_app/templates/includes/small_paper_roll_label.html",
		{
			"doc": doc,
			"display": display,
			"qr_image": qr_image,
			"net_text": net_text,
			"sequence": doc.get("label_sequence") or doc.name,
			"label_title": f"{doc.name}-label",
		},
	)
