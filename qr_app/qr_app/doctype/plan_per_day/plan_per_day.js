// Copyright (c) 2026, surani and contributors
// For license information, please see license.txt

frappe.ui.form.on('Plan Per Day', {
    refresh(frm) { if (frm.doc.name) { frm.add_custom_button("View Jumbo Plans", () => { frappe.set_route("List", "Plan per Jumbo", { plan_per_day: frm.doc.name }); }); }
    frm.add_custom_button('Start Production', function() {

        frappe.call({
            method: "qr_app.qr_app.doctype.plan_per_day.plan_per_day.start_production",
            args: {
                docname: frm.doc.name
            },
            callback: function(r) {

                if (r.message) {
                    frappe.msgprint("Production Started");

                    // 🔥 THIS is what you were missing
                    frappe.set_route("Form", "Operator Job", r.message);
                }

            }
        });

    });
},
    get_items: function(frm) {

        if (!frm.doc.sales_order) {
            frappe.msgprint("Please select Sales Order first");
            return;
        }

        frappe.call({
            method: "qr_app.qr_app.doctype.plan_per_day.plan_per_day.get_sales_order_items",
            args: {
                sales_order: frm.doc.sales_order
            },
            callback: function(r) {

                let data = r.message || [];

                // Ensure each row has unique name (important for dialog table)
                data.forEach(d => {
                    d.name = d.name || frappe.utils.get_random(10);
                });

                let dialog = new frappe.ui.Dialog({
                    title: "Select Sales Order Items",
                    size: "large",
                    fields: [
                        {
                            fieldname: "items",
                            fieldtype: "Table",
                            label: "Items",
                            cannot_add_rows: true,
                            in_place_edit: false,
                            fields: [
                                { fieldname: "select", fieldtype: "Check", label: "Select" },
                                { fieldname: "item_code", fieldtype: "Data", label: "Item", read_only: 1 },
                                { fieldname: "qty", fieldtype: "Float", label: "Qty", read_only: 1 },
                                { fieldname: "gsm", fieldtype: "Float", label: "GSM", read_only: 1 },
                                { fieldname: "widthmm", fieldtype: "Float", label: "Width", read_only: 1 },
                                { fieldname: "lengthm", fieldtype: "Float", label: "Length", read_only: 1 },
                                { fieldname: "delivery_date", fieldtype: "Date", label: "Delivery Date", read_only: 1 }
                            ]
                        }
                    ],

                    primary_action_label: "Add Selected",

                    primary_action(values) {

                        if (!values.items || values.items.length === 0) {
                            frappe.msgprint("No items available");
                            return;
                        }

                        values.items.forEach(row => {

                            if (row.select) {

                                // prevent duplicates
                                let exists = frm.doc.planned_items.some(
                                    i => i.sales_order_item === row.name
                                );

                                if (!exists) {

                                    let child = frm.add_child("planned_items");

                                    child.sales_order = frm.doc.sales_order;
                                    child.sales_order_item = row.name;
                                    child.gsm = row.gsm;
                                    child.width = row.widthmm;
                                    child.length = row.lengthm;
                                    child.qty = row.qty;
                                    child.delivery_date = row.delivery_date;
                                }
                            }
                        });

                        frm.refresh_field("planned_items");
                        dialog.hide();
                    }
                });

                // 🔥 CORRECT DATA BINDING (this was your main issue)
                dialog.fields_dict.items.grid.df.data = data;
                dialog.fields_dict.items.grid.refresh();

                dialog.show();
            }
        });
    }
});
// frappe.ui.form.on('Planned Sales Order Item', {
   
// });