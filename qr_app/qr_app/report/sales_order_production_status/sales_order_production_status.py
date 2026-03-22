# Copyright (c) 2026, surani and contributors
# For license information, please see license.txt

import frappe

def execute(filters=None):

    if filters and filters.get("sales_order"):
        so_filter = {"name": filters.get("sales_order")}
    else:
        so_filter = {"docstatus": 1}

    columns = [
            {"label": "Sales Order", "fieldname": "sales_order", "fieldtype": "Link", "options": "Sales Order", "width": 150},
            {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 200},
            {"label": "GSM", "fieldname": "gsm", "fieldtype": "Data", "width": 100},
            {"label": "Ordered Rolls", "fieldname": "ordered_qty", "fieldtype": "Int", "width": 120},
            {"label": "Produced Rolls", "fieldname": "produced_qty", "fieldtype": "Int", "width": 120},
            {"label": "Remaining Rolls", "fieldname": "remaining_qty", "fieldtype": "Int", "width": 120},
            {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 120},
            {"label": "View Rolls", "fieldname": "view_rolls", "fieldtype": "Button", "width": 120}
        ]

    data = []

    sales_orders = frappe.get_all(
            "Sales Order",
            fields=["name", "customer"],
            filters=so_filter
        )

    for so in sales_orders:

        if filters and filters.get("customer") and so.customer != filters.get("customer"):
            continue

        items = frappe.get_all(
                "Sales Order Item",
                filters={"parent": so.name},
                fields=["gsm", "qty"]
            )

        for item in items:

            if filters and filters.get("gsm") and str(item.gsm) != str(filters.get("gsm")):
                continue

            produced = frappe.db.count(
                    "Serial No",
                    {
                        "sales_order": so.name,
                        "gsm": item.gsm
                    }
                )

            remaining = item.qty - produced
            status = "Completed" if remaining <= 0 else "In Production"

            data.append({
                    "sales_order": so.name,
                    "customer": so.customer,
                    "gsm": item.gsm,
                    "ordered_qty": item.qty,
                    "produced_qty": produced,
                    "remaining_qty": remaining,
                    "status": status,
                    "view_rolls": "View Rolls"
                })
    return columns, data
            
@frappe.whitelist()
def get_gsms(sales_order):

    gsms = frappe.get_all(
        "Sales Order Item",
        filters={"parent": sales_order},
        pluck="gsm"
    )

    return list(set(gsms))