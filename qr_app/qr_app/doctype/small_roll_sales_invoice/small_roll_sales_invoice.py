# Copyright (c) 2025, surani and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document


class SmallRollSalesInvoice(Document):
	pass


@frappe.whitelist()
def get_roll_details_from_scan(scan_text: str, invoice: str | None = None) -> dict:
	if not scan_text:
		frappe.throw(_("Scan returned empty data."))

	value = scan_text.strip()
	roll_name: str | None = None

	if value:
		try:
			payload = json.loads(value)
		except json.JSONDecodeError:
			payload = None

		if isinstance(payload, dict):
			keys_to_try = [
				"name",
				"id",
				"small_paper_roll",
				"roll_id",
				"sequence",
			]
			for key in keys_to_try:
				candidate = payload.get(key)
				if candidate:
					roll_name = str(candidate).strip()
					break

	if not roll_name:
		roll_name = value

	if not roll_name:
		frappe.throw(_("Could not determine Small Paper Roll from scan."))

	roll_name = str(roll_name).strip()

	if not frappe.db.exists("Small Paper Roll", roll_name):
		frappe.throw(
			_("Small Paper Roll {0} not found. Ensure the label is for an active roll.").format(roll_name)
		)

	roll = frappe.get_doc("Small Paper Roll", roll_name)

	linked: list[str] = []
	if roll_name and invoice and frappe.db.has_column("Small Roll Sales Invoice Item", "small_paper_roll"):
		linked = [
			row.parent
			for row in frappe.db.get_all(
				"Small Roll Sales Invoice Item",
				filters={
					"small_paper_roll": roll_name,
					"parent": ("!=", invoice),
				},
				fields=["parent"],
			)
		]

	linked = list(dict.fromkeys(linked))

	return {
		"name": roll.name,
		"gsm": roll.gsm,
		"width_mm": roll.width_mm,
		"length_m": roll.length_m,
		"weight_kg": roll.weight_kg,
		"already_linked_to": linked,
	}
