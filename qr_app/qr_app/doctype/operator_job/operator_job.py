# Copyright (c) 2026, surani and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import base64
from io import BytesIO
import qrcode
from frappe.utils import formatdate
from frappe.utils.pdf import get_pdf

class OperatorJob(Document):
	pass
@frappe.whitelist()
def get_qr_pdf(operator_job, row_name):

    html = get_qr_print_html(operator_job, row_name)

    pdf = get_pdf(html)

    frappe.local.response.filename = f"{row_name}.pdf"
    frappe.local.response.filecontent = pdf
    frappe.local.response.type = "download"

@frappe.whitelist()
def produce_operator_rolls(operator_job, jumbo_roll_id, rolls, serials=None):

    doc = frappe.get_doc("Operator Job", operator_job)

    rolls = frappe.parse_json(rolls)

    if serials:
        serials = frappe.parse_json(serials)

    new_rolls = []

    for i, roll in enumerate(rolls):

        widthmm = float(roll.get("widthmm"))
        lengthm = float(roll.get("lengthm"))
        weight = float(roll.get("weight"))

            # 🔥 Serial generation
        if serials and i < len(serials):
            serial_no = serials[i]
        else:
            serial_no = "SPR-" + frappe.generate_hash(length=5).upper()

                # 🔥 Prevent duplicate serial crash
        if frappe.db.exists("Serial No", serial_no):
            frappe.throw(f"Serial No {serial_no} already exists")

                    # 🔥 Match production item (safe float comparison)
        prod_item = next(
                (p for p in doc.production_item
                if float(p.widthmm) == widthmm and float(p.lengthm) == lengthm),
                None
            )

        sales_order = prod_item.sales_order if prod_item else None
        gsm = prod_item.gsm if prod_item else None

                    # 🔥 Create Serial No
        serial_doc = frappe.new_doc("Serial No")
        serial_doc.item_code = "SPR"
        serial_doc.serial_no = serial_no
        serial_doc.custom_operator_job = doc.name
        serial_doc.parent_jumbo_roll = jumbo_roll_id
        serial_doc.widthmm = widthmm
        serial_doc.lengthm = lengthm
        serial_doc.gsm = gsm
        serial_doc.gross_weightkg = weight
        serial_doc.sales_order = sales_order

        serial_doc.insert(ignore_permissions=True)

                    # 🔥 Add to Operator Job table
        row = doc.append("rolls_manufactured", {
            "id": serial_no,
            "gsm": gsm,
            "widthmm": widthmm,
            "lengthm": lengthm,
            "gross_weight": weight,
            "sales_order": sales_order,
            "jumbo_paper_roll": jumbo_roll_id
        })

        new_rolls.append(row)
	# 🔥 Recalculate remaining qty
    for prod in doc.production_item:
        produced_count = frappe.db.count(
        	"Serial No",
        	filters={
            	"sales_order": prod.sales_order,
            	"gsm": prod.gsm,
            	"widthmm": prod.widthmm,
            	"lengthm": prod.lengthm
        	}
    	)
        prod.qty_to_produce = max(prod.qty_to_produce - produced_count, 0)
    # 🔥 Save document
    doc.save(ignore_permissions=True)

    # 🔥 Clean old stock entries (VERY IMPORTANT)
    delete_old_stock_entries(doc)

                    # 🔥 Create fresh stock entry
    create_stock_entry_for_operator(doc, doc.rolls_manufactured)

    frappe.db.commit()

    return "Success"

def create_stock_entry_for_operator(doc, rolls):

    if not rolls:
        return

    se = frappe.new_doc("Stock Entry")
    se.stock_entry_type = "Material Receipt"
    se.company = "Eximius (Demo)"
    se.operator_job = doc.name

    for roll in rolls:   # 🔥 Now ALL rolls

        se.append("items", {
            "item_code": "SPR",
            "qty": 1,
            "serial_no": roll.id,
            "t_warehouse": "Finished Goods - ED",
            "gsm": roll.gsm,
            "widthmm": roll.widthmm,
            "lengthm": roll.lengthm,
            "gross_weightkg": roll.gross_weight,
            "sales_order": roll.sales_order
        })

    se.insert(ignore_permissions=True)
    se.submit()

def delete_old_stock_entries(doc):

    entries = frappe.get_all(
        "Stock Entry",
        filters={"operator_job": doc.name},
        pluck="name"
    )

    for se_name in entries:

        se_doc = frappe.get_doc("Stock Entry", se_name)

        if se_doc.docstatus == 1:
            se_doc.cancel()

        frappe.delete_doc("Stock Entry", se_name, force=True)

@frappe.whitelist()
def get_qr_print_html(operator_job: str, row_name: str) -> str:

    doc = frappe.get_doc("Operator Job", operator_job)

    # 🔥 Find roll
    roll = next((r for r in doc.rolls_manufactured if r.name == row_name), None)

    if not roll:
        frappe.throw("Roll not found")

        # 🔥 Manufacturing date (fallback to creation)
    formatted_mfg = (
        formatdate(doc.get("posting_date") or doc.creation, "dd-MM-yy")
    )

        # 🔥 QR Data
    label_data = {
        "roll_id": str(roll.id),
        "operator_job": operator_job
    }

    qr_buffer = BytesIO()
    qrcode.make(frappe.as_json(label_data)).save(qr_buffer, format="PNG")
    qr_image = base64.b64encode(qr_buffer.getvalue()).decode()

        # 🔥 Display values
    display = {
        "width": roll.get_formatted("widthmm") if roll.widthmm else None,
        "length": roll.get_formatted("lengthm") if roll.lengthm else None,
        "gsm": roll.get_formatted("gsm") if roll.gsm else None,
        "weight": roll.get_formatted("gross_weight") if roll.gross_weight else None,
        "manufacture_date": formatted_mfg,
        "jumbo_roll": roll.get("jumbo_paper_roll")
    }

        # 🔥 Net text line
    parts = []

    if roll.gross_weight:
        weight_g = int(roll.gross_weight * 1000)
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
            "doc": roll,
            "display": display,
            "qr_image": qr_image,
            "net_text": net_text,
            "sequence": roll.get("label_sequence") or roll.name,
            "label_title": f"{roll.id}-label",
        },
    )