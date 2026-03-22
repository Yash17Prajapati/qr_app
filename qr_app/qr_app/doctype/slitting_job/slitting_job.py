# Copyright (c) 2025, surani and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import base64
from io import BytesIO
import qrcode
from frappe.utils import formatdate

class SlittingJob(Document):

    def sync_serial_numbers(self):
        """Keep Serial No fields synced with rolls_manufactured table"""

        for roll in self.rolls_manufactured:

            if not roll.id:
                continue

            serial = frappe.get_doc("Serial No", roll.id)

            if (
                serial.gsm != roll.gsm
                or serial.widthmm != roll.widthmm
                or serial.lengthm != roll.lengthm
            ):
                serial.gsm = roll.gsm
                serial.widthmm = roll.widthmm
                serial.lengthm = roll.lengthm
                serial.save(ignore_permissions=True)


    def create_stock_entry(self,new_rolls=None):
        """Create stock entry from produced rolls"""

        if not new_rolls:
            return

        se = frappe.new_doc("Stock Entry")
        se.stock_entry_type = "Material Receipt"
        se.company = "Eximius (Demo)"
        se.slitting_job = self.name

        for roll in new_rolls:

            se.append("items", {
                "item_code": "SPR",
                "qty": 1,
                "serial_no": roll.id,
                "t_warehouse": "Finished Goods - ED",
                "gsm": roll.gsm,
                "widthmm": roll.widthmm,
                "lengthm": roll.lengthm,
                "gross_weightkg": roll.gross_weight,
                "net_weightkg": roll.net_weight,
                "sales_order": roll.sales_order
            })

        se.insert(ignore_permissions=True)
        se.submit()


    def rebuild_stock_entry(self):
        """Recreate stock entry when rolls change"""

        entries = frappe.get_all(
        "Stock Entry",
        filters={"slitting_job": self.name},
        pluck="name"
        )

        for se_name in entries:

            se_doc = frappe.get_doc("Stock Entry", se_name)

            if se_doc.docstatus == 1:
                se_doc.cancel()

            frappe.delete_doc("Stock Entry", se_name, force=True)

            # rebuild with updated rolls
        self.create_stock_entry(self.rolls_manufactured)

    def on_update_after_submit(self):
        """If rolls change after submit"""
        if self.flags.ignore_validate_update_after_submit:
            return
        self.sync_serial_numbers()
        self.rebuild_stock_entry()

@frappe.whitelist()
def get_customers_with_open_sales_orders(doctype, txt, searchfield, start, page_len, filters):

    return frappe.db.sql("""
SELECT DISTINCT so.customer
FROM `tabSales Order` so
WHERE
so.docstatus = 1
AND so.status IN ('To Deliver', 'To Deliver and Bill')
AND so.customer LIKE %(txt)s
AND EXISTS (
    SELECT 1
    FROM `tabSales Order Item` soi
    WHERE soi.parent = so.name
    AND soi.qty >
    (
        SELECT COUNT(rm.name)
        FROM `tabSlitting Job` sj
        JOIN `tabManufactured Items` rm ON rm.parent = sj.name
        WHERE
        sj.sales_order = so.name
        AND rm.gsm = soi.gsm
        AND rm.widthmm = soi.widthmm
        AND rm.lengthm = soi.lengthm
    )
)
LIMIT %(start)s, %(page_len)s
""", {
    "txt": f"%{txt}%",
    "start": start,
    "page_len": page_len
})


@frappe.whitelist()
def get_pending_gsm_list(sales_order):

    so = frappe.get_doc("Sales Order", sales_order)
    pending_gsms = set()

    for item in so.items:

        produced = frappe.db.sql("""
        SELECT COUNT(rm.name)
        FROM `tabSlitting Job` sj
        JOIN `tabManufactured Items` rm ON rm.parent = sj.name
        WHERE
        sj.sales_order = %s
        AND sj.docstatus < 2
        AND rm.gsm = %s
        AND rm.widthmm = %s
        AND rm.lengthm = %s
        """, (
            so.name,
            item.gsm,
            item.widthmm,
            item.lengthm
        ))[0][0]

        if produced < item.qty:
            pending_gsms.add(item.gsm)

    return sorted(pending_gsms)


@frappe.whitelist()
def get_open_sales_orders(doctype, txt, searchfield, start, page_len, filters):

    customer = filters.get("customer")

    return frappe.db.sql("""
SELECT DISTINCT so.name
FROM `tabSales Order` so
JOIN `tabSales Order Item` soi ON soi.parent = so.name

LEFT JOIN (
    SELECT
    sales_order,
    gsm,
    widthmm,
    lengthm,
    COUNT(name) AS produced_qty
    FROM `tabSerial No`
    WHERE sales_order IS NOT NULL
    GROUP BY sales_order, gsm, widthmm, lengthm
) prod
ON prod.sales_order = so.name
AND prod.gsm = soi.gsm
AND prod.widthmm = soi.widthmm
AND prod.lengthm = soi.lengthm

WHERE
so.docstatus = 1
AND so.customer = %(customer)s
AND so.name LIKE %(txt)s
AND COALESCE(prod.produced_qty,0) < soi.qty

AND NOT EXISTS (
    SELECT 1
    FROM `tabSlitting Job` sj
    WHERE sj.sales_order = so.name
    AND sj.workflow_state = 'In Progress'
)

LIMIT %(start)s, %(page_len)s
""", {
    "txt": f"%{txt}%",
    "start": start,
    "page_len": page_len,
    "customer": customer
})

# @frappe.whitelist()
# def produce_roll(slitting_job, widthmm, lengthm, gsm, qty, weights, serials=None):
#     new_rolls = []
#     doc = frappe.get_doc("Slitting Job", slitting_job)

#     weights = frappe.parse_json(weights)

#     if serials:
#         serials = frappe.parse_json(serials)

#     for i in range(int(qty)):

#         weight = weights[i] if i < len(weights) else 0

#             # choose serial number
#         if serials and i < len(serials):
#             serial_no = serials[i]
#         else:
#             serial_no = "SPR-" + frappe.generate_hash(length=8)

#                 # ALWAYS create serial document
#         serial_doc = frappe.new_doc("Serial No")
#         serial_doc.item_code = "SPR"
#         serial_doc.serial_no = serial_no
#         serial_doc.slitting_job = doc.name
#         serial_doc.parent_jumbo_roll = doc.jumbo_paper_roll
#         serial_doc.widthmm = widthmm
#         serial_doc.lengthm = lengthm
#         serial_doc.gsm = gsm
#         serial_doc.gross_weightkg = weight
#         serial_doc.sales_order = doc.sales_order

#         serial_doc.insert(ignore_permissions=True)

#                 # ALWAYS append to table
#         row=doc.append("rolls_manufactured", {
#                     "id": serial_no,
#                     "gsm": gsm,
#                     "widthmm": widthmm,
#                     "lengthm": lengthm,
#                     "gross_weight": weight,
#                     "sales_order": doc.sales_order
#                 })
#         new_rolls.append(row)
#     # Recalculate remaining quantity
#     for row in doc.slitted_roll_item:

#         produced = frappe.db.count(
#         "Serial No",
#         filters={
#             "sales_order": doc.sales_order,
#             "gsm": row.gsm,
#             "widthmm": row.width,
#             "lengthm": row.length
#         }
#     )

#         row.remaining_qty = max(row.qty - produced, 0)
#     doc.flags.ignore_validate_update_after_submit = True

#     doc.save(ignore_permissions=True)
#     doc.create_stock_entry(new_rolls)
#     frappe.db.commit()

@frappe.whitelist()
def produce_roll(slitting_job, jumbo_roll_id, gsm, rolls, serials=None):

    new_rolls = []
    doc = frappe.get_doc("Slitting Job", slitting_job)

    rolls = frappe.parse_json(rolls)

    if serials:
        serials = frappe.parse_json(serials)

    for i, roll in enumerate(rolls):

        widthmm = roll.get("width")
        lengthm = roll.get("length")
        weight = roll.get("weight")

            # choose serial number
        if serials and i < len(serials):
            serial_no = serials[i]
        else:
            serial_no = "SPR-" + frappe.generate_hash(length=3)

                # create serial document
        serial_doc = frappe.new_doc("Serial No")
        serial_doc.item_code = "SPR"
        serial_doc.serial_no = serial_no
        serial_doc.slitting_job = doc.name
        serial_doc.parent_jumbo_roll = jumbo_roll_id
        serial_doc.widthmm = widthmm
        serial_doc.lengthm = lengthm
        serial_doc.gsm = gsm
        serial_doc.gross_weightkg = weight
        serial_doc.sales_order = doc.sales_order

        serial_doc.insert(ignore_permissions=True)

                # append to table
        row = doc.append("rolls_manufactured", {
                    "id": serial_no,
                    "gsm": gsm,
                    "widthmm": widthmm,
                    "lengthm": lengthm,
                    "gross_weight": weight,
                    "sales_order": doc.sales_order,
                    "jumbo_paper_roll": jumbo_roll_id
                })

        new_rolls.append(row)

                # Recalculate remaining quantity
    for row in doc.slitted_roll_item:

        produced = frappe.db.count(
            "Serial No",
            filters={
            "sales_order": doc.sales_order,
            "gsm": row.gsm,
            "widthmm": row.width,
            "lengthm": row.length
                    }
        )

        row.remaining_qty = max(row.qty - produced, 0)

    doc.flags.ignore_validate_update_after_submit = True

    doc.save(ignore_permissions=True)

    doc.create_stock_entry(new_rolls)

    frappe.db.commit()

@frappe.whitelist()
def get_available_rolls(slitting_job):
    """Return produced rolls for bundle creation"""

    doc = frappe.get_doc("Slitting Job", slitting_job)

    return [r.id for r in doc.rolls_manufactured]

@frappe.whitelist()
def create_bundle(slitting_job, rolls):
    """Create roll bundle"""

    rolls = frappe.parse_json(rolls)

    bundle = frappe.new_doc("Roll Bundle")
    bundle.slitting_job = slitting_job

    for r in rolls:
        bundle.append("bundle_items", {"roll_id": r})

    bundle.insert(ignore_permissions=True)

    return bundle.name

@frappe.whitelist()
def get_slitted_items(sales_order):

    so = frappe.get_doc("Sales Order", sales_order)

    rows = []

    for item in so.items:

        produced = frappe.db.count(
            "Serial No",
            filters={
                "sales_order": so.name,
                "gsm": item.gsm,
                "widthmm": item.widthmm,
                "lengthm": item.lengthm
            }
        )
        
        remaining_qty = item.qty - produced
        
        if remaining_qty < 0:
            remaining_qty = 0
        rows.append({
            "gsm": item.gsm,
            "widthmm": item.widthmm,
            "lengthm": item.lengthm,
            "qty": item.qty,
            "remaining_qty": remaining_qty,
            "delivery_date": item.delivery_date
        })

    return rows

@frappe.whitelist()
def get_previous_slitting_jobs(sales_order, gsm, current_job):

    current_creation = frappe.db.get_value(
        "Slitting Job",
        current_job,
        "creation"
    )

    jobs = frappe.get_all(
        "Slitting Job",
        filters={
            "sales_order": sales_order,
            "job_gsm": gsm,
            "docstatus": 1,
            "creation": ("<", current_creation)
        },
        fields=["name", "job_date"],
        order_by="creation desc"
    )

    result = []

    for job in jobs:

        rolls = frappe.get_all(
            "Manufactured Items",
            filters={"parent": job.name},
            fields=["widthmm", "lengthm"]
        )

        for r in rolls:
            result.append({
                "slitting_job": job.name,
                "job_date": job.job_date,
                "width": r.widthmm,
                "length": r.lengthm,
                "produced_quantity": 1
            })

    return result

@frappe.whitelist()
def get_qr_print_html(slitting_job: str, row_name: str) -> str:

    doc = frappe.get_doc("Slitting Job", slitting_job)

    roll = None
    for r in doc.rolls_manufactured:
        if r.name == row_name:
            roll = r
            break

    if not roll:
        frappe.throw("Roll not found")

    formatted_mfg = (
        formatdate(doc.job_date, "dd-MM-yy")
        if doc.get("job_date")
        else None
    )

    label_data = {
        "roll_id": str(roll.id),
        "slitting_job": slitting_job
    }

    qr_buffer = BytesIO()
    qrcode.make(frappe.as_json(label_data)).save(qr_buffer, format="PNG")
    qr_image = base64.b64encode(qr_buffer.getvalue()).decode()

    display = {
        "width": roll.get_formatted("widthmm") if roll.widthmm else None,
        "length": roll.get_formatted("lengthm") if roll.lengthm else None,
        "gsm": roll.get_formatted("gsm") if roll.gsm else None,
        "weight": roll.get_formatted("gross_weight") if roll.gross_weight else None,
        "manufacture_date": formatted_mfg,
    }

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