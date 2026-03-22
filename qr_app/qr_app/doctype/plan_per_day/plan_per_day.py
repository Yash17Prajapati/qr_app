# Copyright (c) 2026, surani and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PlanPerDay(Document):
	pass

@frappe.whitelist()
def get_sales_order_items(sales_order):
    return frappe.db.sql("""
SELECT
name,
item_code,
qty,
gsm,
widthmm,
lengthm,
delivery_date
FROM `tabSales Order Item`
WHERE parent = %s
""", (sales_order,), as_dict=True)

@frappe.whitelist()
def start_production(docname):
    plan = frappe.get_doc("Plan Per Day", docname)

    job = frappe.new_doc("Operator Job")
    job.plan_per_day = docname

    customer_cache = {}

    for item in plan.planned_items:

        # 🔥 Fetch Customer from Sales Order
        if item.sales_order not in customer_cache:
            so = frappe.get_doc("Sales Order", item.sales_order)
            customer_cache[item.sales_order] = so.customer

            # 🔥 Fetch Jumbo from Plan Per Jumbo
        jumbo = frappe.db.get_value(
            "Plan Per Jumbo",
            {"plan_per_day": docname},
            "select_jumbo"
        )

        job.append("production_item", {
            "sales_order": item.sales_order,
            "customer": customer_cache[item.sales_order],
            "gsm": item.gsm,
            "widthmm": item.widthmm,
            "lengthm": item.lengthm,
            "jumbo_roll": jumbo,
            "qty_to_produce": item.qty
        })

    job.insert()
    frappe.db.commit()

    return job.name