# Copyright (c) 2025, surani and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SlittingJob(Document):
    def validate(self):
        if self.docstatus == 1:  # submit
            if self.job_status == "In Progress":
                frappe.throw(
                    "You cannot submit the Slitting Job while it is In Progress. "
                    "Set status to Jumbo Finished or Completed before submitting."
                )

            total_produced = 0

            for row in self.slitted_roll_item:
                if row.produced_quantity is None or row.produced_quantity < 0:
                    frappe.throw(
                        f"Produced Quantity cannot be negative (Row {row.idx})"
                    )

                if row.produced_quantity > row.qty:
                    frappe.throw(
                        f"Produced Quantity cannot be greater than Planned Quantity (Row {row.idx})"
                    )

                total_produced += row.produced_quantity or 0

            if total_produced == 0:
                frappe.throw(
                    "You cannot submit the job with zero production. "
                    "At least one Small Paper Roll must be produced."
                )
        if not self.sales_order or not self.job_gsm:
            return
        valid_gsms=get_pending_gsm_list(self.sales_order)
        if self.job_gsm not in valid_gsms:
            frappe.throw(
                f'GSM {self.job_gsm} is not pending for this sales order.'
                f'Valid GSMs are: {", ".join(map(str,valid_gsms))}'
            )
        for row in self.slitted_roll_item:
            if row.produced_quantity > row.remaining_qty:
                frappe.throw(
                f"Produced Qty cannot exceed Remaining Qty "
                f"(Available: {row.remaining_qty}) for Width {row.width} mm"
            )
    def on_submit(self):
        # frappe.throw("On Submit is Running")
        for row in self.slitted_roll_item:
            qty = row.produced_quantity or 0
            # frappe.msgprint(f'Producing Row {row} with row.produced_quantity {row.produced_quantity} and qty {row.qty}')
            for _ in range(int(qty)):
                roll = frappe.new_doc("Serial No")
                roll.item_code='SPR'
                roll.serial_no='SPR-'+frappe.generate_hash(length=8)
                # roll.warehouse='Finished Goods - ED'
                roll.slitting_job = self.name
                roll.parent_jumbo_roll = self.jumbo_paper_roll
                roll.gsm = row.gsm
                roll.widthmm = row.width
                roll.lengthm = row.length
                roll.insert(ignore_permissions=True)

        if self.job_status == "Jumbo Finished":
            frappe.db.set_value(
                "Jumbo Paper Roll",
                self.jumbo_paper_roll,
                "status",
                "Finished"
            )
@frappe.whitelist()
def get_pending_gsm_list(sales_order):
    so = frappe.get_doc("Sales Order", sales_order)
    pending_gsms = set()

    for item in so.items:
        produced = frappe.db.sql("""
            SELECT COALESCE(SUM(sri.produced_quantity), 0)
            FROM `tabSlitting Job` sj
            JOIN `tabSlitted Roll Item` sri ON sri.parent = sj.name
            WHERE
                sj.sales_order = %s
                AND sj.docstatus = 1
                AND sri.gsm = %s
                AND sri.width = %s
                AND sri.length = %s
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
def get_remaining_items_for_gsm(sales_order, gsm):
    so = frappe.get_doc("Sales Order", sales_order)
    remaining_rows = []

    for item in so.items:
        if item.gsm != gsm:
            continue

        produced = frappe.db.sql("""
            SELECT COALESCE(SUM(sri.produced_quantity), 0)
            FROM `tabSlitting Job` sj
            JOIN `tabSlitted Roll Item` sri ON sri.parent = sj.name
            WHERE
                sj.sales_order = %s
                AND sj.docstatus = 1
                AND sri.gsm = %s
                AND sri.width = %s
                AND sri.length = %s
        """, (
            so.name,
            item.gsm,
            item.widthmm,
            item.lengthm
        ))[0][0]

        remaining_qty = item.qty - produced

        # 🔒 ONLY remaining demand survives
        if remaining_qty > 0:
            remaining_rows.append({
                "gsm": item.gsm,
                "width": item.widthmm,
                "length": item.lengthm,
                "qty": remaining_qty
            })

    return remaining_rows

@frappe.whitelist()
def get_slitted_items_with_remaining(sales_order, gsm):

    result = []

    # 1️⃣ Source of truth: Sales Order Slitting Items
    so_items = frappe.db.sql("""
        SELECT
            widthmm,
            lengthm,
            gsm,
            qty
        FROM `tabSales Order Item`
        WHERE parent = %s
          AND gsm = %s
    """, (sales_order, gsm), as_dict=True)

    for item in so_items:

        # 2️⃣ Total produced so far
        produced = frappe.db.sql("""
            SELECT IFNULL(SUM(sri.produced_quantity), 0) AS produced_quantity
            FROM `tabSlitting Job` sj
            JOIN `tabSlitted Roll Item` sri ON sri.parent = sj.name
            WHERE sj.sales_order = %s
              AND sj.docstatus = 1
              AND sri.gsm = %s
              AND sri.width = %s
              AND sri.length = %s
        """, (
            sales_order,
            item.gsm,
            item.widthmm,
            item.lengthm
        ), as_dict=True)

        total_produced = produced[0].produced_quantity or 0
        remaining_qty = item.qty - total_produced

        result.append({
            "width": item.widthmm,
            "length": item.lengthm,
            "gsm": item.gsm,
            "qty": item.qty,
            "produced_quantity": total_produced,
            "remaining_qty": max(remaining_qty, 0)
        })

    return result

@frappe.whitelist()
def get_previous_slitting_jobs(sales_order, gsm, current_job):

    current_creation = frappe.db.get_value(
        "Slitting Job",
        current_job,
        "creation"
    )

    return frappe.db.sql("""
        SELECT
            sj.name AS slitting_job,
            sj.job_date,
            sri.width,
            sri.length,
            sri.produced_quantity
        FROM `tabSlitting Job` sj
        JOIN `tabSlitted Roll Item` sri ON sri.parent = sj.name
        WHERE sj.sales_order = %s
          AND sj.job_gsm = %s
          AND sj.docstatus = 1
          AND sj.creation < %s
          AND sri.produced_quantity > 0
        ORDER BY sj.creation DESC
    """, (sales_order, gsm, current_creation), as_dict=True)



# def validate(doc, method):
# 	if not doc.slitted_roll_item:
# 		frappe.throw("Slitting Job must have at least one slitted roll item.")

# 	for idx, item in enumerate(doc.slitted_roll_item, start=1):
# 		if not item.qty or item.qty <= 0:
# 			frappe.throw(f"Row {idx}: Quantity must be greater than 0.")

# 		if not item.width or item.width <= 0:
# 			frappe.throw(f"Row {idx}: Width (mm) must be greater than 0.")

# 		if not item.length or item.length <= 0:
# 			frappe.throw(f"Row {idx}: Length (m) must be greater than 0.")

# 		if not item.gsm or item.gsm <= 0:
# 			frappe.throw(f"Row {idx}: GSM must be greater than 0.")
# 	if doc.docstatus==1:
# 		if doc.job_status=='In Progress':
# 			frappe.throw("You can not submit the slitting job while it is in Progress."
# 				"Set status to jumbo finished or completed before submitting.")


# def on_submit(doc, method):
# 	existing = frappe.get_all(
# 		"Small Paper Roll",
# 		filters={"slitting_job": doc.name},
# 		limit=1,
# 	)

# 	if existing:
# 		frappe.throw("Small Paper Rolls already created for this Slitting Job.")

# 	for item in doc.slitted_roll_item:
# 		for _ in range(item.qty):
# 			roll = frappe.new_doc("Small Paper Roll")
# 			roll.parent_jumbo_roll = doc.jumbo_paper_roll
# 			roll.slitting_job = doc.name
# 			roll.width_mm = item.width
# 			roll.length_m = item.length
# 			roll.gsm = item.gsm
# 			roll.insert(ignore_permissions=True)



