// Copyright (c) 2025, surani and contributors
// For license information, please see license.txt

frappe.ui.form.on("Manufactured Items", {
    print_qr(frm, cdt, cdn) {

    let row = locals[cdt][cdn];

    if (!row.gross_weight || parseFloat(row.gross_weight) <= 0) {
        frappe.throw("Gross Weight must be entered before printing QR.");
    }

    function print_label() {

        frappe.call({
            method: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_qr_print_html",
            args: {
                slitting_job: frm.doc.name,
                row_name: row.name
            },
            callback: function(r) {
                
                if (!r.message) return;

                const w = window.open("", "_blank");

                w.document.open();
                w.document.write(r.message);
                w.document.close();

                // wait for the label HTML + QR image to load
                w.onload = function () {
                    setTimeout(() => {
                        w.focus();
                        w.print();
                    }, 300);
                };
            }
        });

    }

    // First time printing
    if (!row.qr_printed) {

        console.log("Printing QR for:", row.name);

        print_label();

        row.qr_printed = 1;
        frm.refresh_field("rolls_manufactured");

        return;
    }

    // Already printed → ask confirmation
    frappe.confirm(
        "QR for this roll was already printed. Print again?",
        function () {

            console.log("Reprinting QR for:", row.name);

            print_label();

        },
        function () {
            frappe.msgprint("Printing cancelled.");
        }
    );
}
});
frappe.ui.form.on("Slitting Job", {
    customer(frm) {
        frm.set_value("sales_order", null);

        frm.set_query("sales_order", function () {
            return {
                query: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_open_sales_orders",
                filters: {
                    customer: frm.doc.customer
                }
            };
        });
    },
    refresh(frm) {

        // if (frm.doc.workflow_state === "In Progress") {

        //     frm.add_custom_button("Produce Small Roll", () => {

        //         // Build dropdown with remaining quantity
        //         let dimension_options = frm.doc.slitted_roll_item
        //             .filter(r => (r.remaining_qty ?? r.qty) > 0)
        //             .map(r => {
        //                 let remaining = r.remaining_qty ?? r.qty;

        //                 return {
        //                     label: `${r.width}mm × ${r.length}m (${r.gsm} GSM) — Remaining: ${remaining}`,
        //                     value: `${r.width}|${r.length}|${r.gsm}|${remaining}`
        //                 };
        //             });

        //         let dialog = new frappe.ui.Dialog({
        //             title: "Produce Small Paper Roll",
        //             fields: [
        //                 {
        //                     label: "Cut Size",
        //                     fieldname: "cut_size",
        //                     fieldtype: "Select",
        //                     options: dimension_options.map(o => o.label),
        //                     reqd: 1
        //                 },
        //                 {
        //                     label: "Quantity",
        //                     fieldname: "qty",
        //                     fieldtype: "Int",
        //                     default: 1,
        //                     reqd: 1
        //                 },
        //                 {
        //                     fieldname: "weights_section",
        //                     fieldtype: "HTML"
        //                 }
        //             ],

        //             primary_action_label: "Create Rolls",

        //             primary_action(values) {

        //                 if (!values.cut_size) {
        //                     frappe.msgprint("Please select cut size.");
        //                     return;
        //                 }

        //                 // Find selected option
        //                 let selected_option = dimension_options.find(o =>
        //                     o.label === values.cut_size
        //                 );

        //                 let [width, length, gsm, remaining] = selected_option.value.split("|");

        //                 remaining = parseInt(remaining);

        //                 if (values.qty > remaining) {
        //                     frappe.msgprint(`Cannot produce more than remaining quantity (${remaining}).`);
        //                     return;
        //                 }

        //                 let weights = [];
        //                 let invalid_weight = false;
        //                 let serials = dialog.generated_serials || [];

        //                 dialog.$wrapper.find(".roll-weight").each(function () {

        //                     let value = $(this).val();

        //                     if (value === "" || parseFloat(value) <= 0) {
        //                         invalid_weight = true;
        //                     }

        //                     weights.push(parseFloat(value));
        //                 });

        //                 if (invalid_weight) {
        //                     frappe.msgprint("Please enter valid weight for all rolls.");
        //                     return;
        //                 }

        //                 frappe.call({
        //                     method: "qr_app.qr_app.doctype.slitting_job.slitting_job.produce_roll",
        //                     args: {
        //                         slitting_job: frm.doc.name,
        //                         widthmm: parseFloat(width),
        //                         lengthm: parseFloat(length),
        //                         gsm: parseFloat(gsm),
        //                         qty: values.qty,
        //                         weights: weights,
        //                         serials: serials
        //                     },
        //                     callback: function (r) {
        //                         dialog.hide();
        //                         if (!r.exc) {
        //                             frm.reload_doc();
                                    
        //                         }
        //                     }
        //                 });

        //             }
        //         });

        //         dialog.show();

        //         function generate_weight_inputs() {

        //             let qty = parseInt(dialog.get_value("qty")) || 0;

        //             // Initialize storage
        //             if (!dialog.generated_serials) dialog.generated_serials = [];
        //             if (!dialog.weight_store) dialog.weight_store = [];

        //             // Save existing weights before redraw
        //             dialog.$wrapper.find(".roll-weight").each(function () {
        //                 let idx = $(this).data("index");
        //                 dialog.weight_store[idx] = $(this).val();
        //             });

        //             // Only ADD serials if quantity increases
        //             while (dialog.generated_serials.length < qty) {
        //                 dialog.generated_serials.push(
        //                     "SPR-" + frappe.utils.get_random(8).toUpperCase()
        //                 );
        //             }

        //             // IMPORTANT: do NOT slice serials here
        //             // we only control what is rendered

        //             let html = `<div style="margin-top:10px">`;

        //             for (let i = 0; i < qty; i++) {

        //                 let serial = dialog.generated_serials[i];
        //                 let weight_value = dialog.weight_store[i] || "";

        //                 html += `
        //     <div style="margin-bottom:6px">
        //         ${serial} Weight (kg):
        //         <input type="number"
        //                class="roll-weight form-control"
        //                data-index="${i}"
        //                value="${weight_value}"
        //                min="0.01"
        //                step="0.01"
        //                style="width:200px; display:inline-block"/>
        //     </div>`;
        //             }

        //             html += `</div>`;

        //             dialog.fields_dict.weights_section.$wrapper.html(html);
        //         }

        //         dialog.fields_dict.qty.$input.on("input", generate_weight_inputs);

        //         generate_weight_inputs();

        //     });

        // }


        if (frm.doc.workflow_state === "In Progress") {

    frm.add_custom_button("Produce Small Roll", () => {

        // Build dropdown with remaining quantity
        let dimension_options = frm.doc.slitted_roll_item
            .filter(r => (r.remaining_qty ?? r.qty) > 0)
            .map(r => {
                let remaining = r.remaining_qty ?? r.qty;

                return {
                    label: `${r.width}mm × ${r.length}m (${r.gsm} GSM) — Remaining: ${remaining}`,
                    value: `${r.width}|${r.length}|${r.gsm}|${remaining}`
                };
            });

        let dialog = new frappe.ui.Dialog({
            title: "Produce Small Paper Roll",
            size: "large",
            fields: [
                {
                    label: "Cut Size",
                    fieldname: "cut_size",
                    fieldtype: "Select",
                    options: dimension_options.map(o => o.label),
                    reqd: 1
                },

                {
                    label: "Jumbo Roll ID",
                    fieldname: "jumbo_roll_id",
                    fieldtype: "Data",
                    reqd: 1
                },

                {
                    label: "Quantity",
                    fieldname: "qty",
                    fieldtype: "Int",
                    default: 1,
                    reqd: 1
                },

                {
                    fieldname: "weights_section",
                    fieldtype: "HTML"
                }
            ],

            primary_action_label: "Create Rolls",

            primary_action(values) {

                if (!values.cut_size) {
                    frappe.msgprint("Please select cut size.");
                    return;
                }

                if (!values.jumbo_roll_id) {
                    frappe.msgprint("Please enter Jumbo Roll ID.");
                    return;
                }

                let selected_option = dimension_options.find(o =>
                    o.label === values.cut_size
                );

                let [width, length, gsm, remaining] = selected_option.value.split("|");

                remaining = parseInt(remaining);

                if (values.qty > remaining) {
                    frappe.msgprint(`Cannot produce more than remaining quantity (${remaining}).`);
                    return;
                }

                let rolls = [];
                let invalid = false;
                let serials = dialog.generated_serials || [];

                dialog.$wrapper.find(".roll-row").each(function () {

                    let width_val = parseFloat($(this).find(".roll-width").val());
                    let length_val = parseFloat($(this).find(".roll-length").val());
                    let weight_val = parseFloat($(this).find(".roll-weight").val());

                    if (!width_val || !length_val || !weight_val || weight_val <= 0) {
                        invalid = true;
                    }

                    rolls.push({
                        width: width_val,
                        length: length_val,
                        weight: weight_val
                    });

                });

                if (invalid) {
                    frappe.msgprint("Please enter valid width, length and weight for all rolls.");
                    return;
                }

                frappe.call({
                    method: "qr_app.qr_app.doctype.slitting_job.slitting_job.produce_roll",
                    args: {
                        slitting_job: frm.doc.name,
                        jumbo_roll_id: values.jumbo_roll_id,
                        gsm: parseFloat(gsm),
                        rolls: rolls,
                        serials: serials
                    },
                    callback: function (r) {
                        dialog.hide();
                        if (!r.exc) {
                            frm.reload_doc();
                        }
                    }
                });

            }
        });

        dialog.show();


        function generate_roll_inputs() {

            let qty = parseInt(dialog.get_value("qty")) || 0;

            if (!dialog.generated_serials) dialog.generated_serials = [];
            if (!dialog.roll_store) dialog.roll_store = [];

            // Save existing values before redraw
            dialog.$wrapper.find(".roll-row").each(function () {

                let idx = $(this).data("index");

                dialog.roll_store[idx] = {
                    width: $(this).find(".roll-width").val(),
                    length: $(this).find(".roll-length").val(),
                    weight: $(this).find(".roll-weight").val()
                };

            });

            // Generate serial numbers
            while (dialog.generated_serials.length < qty) {
                dialog.generated_serials.push(
                    "SPR-" + frappe.utils.get_random(3).toUpperCase()
                );
            }

            let selected_option = dimension_options.find(o =>
                o.label === dialog.get_value("cut_size")
            );

            let default_width = "";
            let default_length = "";

            if (selected_option) {
                let [width, length] = selected_option.value.split("|");
                default_width = width;
                default_length = length;
            }

            let html = `
                <div style="margin-top:10px">
                
            `;

            for (let i = 0; i < qty; i++) {

                let serial = dialog.generated_serials[i];

                let stored = dialog.roll_store[i] || {};

                let width_val = stored.width || default_width;
                let length_val = stored.length || default_length;
                let weight_val = stored.weight || "";

                html += `
                <div class="roll-row" data-index="${i}"
                    style="margin-bottom:8px; display:flex; align-items:center; gap:8px">

                    <b style="width:150px">${serial} :</b>

                    <input type="number"
                        class="roll-width form-control"
                        value="${width_val}"
                        step="0.1"
                        style="width:80px"/>

                    <span>mm ×</span>

                    <input type="number"
                        class="roll-length form-control"
                        value="${length_val}"
                        step="0.1"
                        style="width:90px"/>

                    <span>m</span>

                    <input type="number"
                        class="roll-weight form-control"
                        value="${weight_val}"
                        min="0.01"
                        step="0.01"
                        placeholder="Weight (kg)"
                        style="width:120px"/>

                </div>`;
            }

            html += `</div>`;

            dialog.fields_dict.weights_section.$wrapper.html(html);
        }

        dialog.fields_dict.qty.$input.on("input", generate_roll_inputs);
        dialog.fields_dict.cut_size.$input.on("change", generate_roll_inputs);

        generate_roll_inputs();

    });

}
        
        // load_remaining_items(frm);
        // Hide by default
        frm.toggle_display("previous_jobs_html", false);

        if (!frm.doc.sales_order || !frm.doc.job_gsm) return;

        frappe.call({
            method: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_previous_slitting_jobs",
            args: {
                sales_order: frm.doc.sales_order,
                gsm: frm.doc.job_gsm,
                current_job: frm.doc.name
            },
            callback(r) {
                if (!r.message || r.message.length === 0) {
                    // No previous jobs → keep hidden
                    return;
                }

                // Build HTML table
                let html = `
                    <h5>Previous Slitting Jobs</h5>
                    <table class="table table-bordered">
                        <thead>
                            <tr>
                                <th>Job</th>
                                <th>Date</th>
                                <th>Width (mm)</th>
                                <th>Length (m)</th>
                                <th>Produced Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                r.message.forEach(row => {
                    html += `
                        <tr>
                            <td>${row.slitting_job}</td>
                            <td>${row.job_date || ""}</td>
                            <td>${row.width}</td>
                            <td>${row.length}</td>
                            <td>${row.produced_quantity}</td>
                        </tr>
                    `;
                });

                html += `</tbody></table>`;

                // Show + populate
                frm.set_df_property("previous_jobs_html", "options", html);
                frm.toggle_display("previous_jobs_html", true);
            }
        });
    },
    setup(frm) {
        frm.set_query("customer", function () {
            return {
                query: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_customers_with_open_sales_orders"
            };
        });

        frm.set_query("jumbo_paper_roll", function () {
            if (!frm.doc.job_gsm) {
                return {
                    filters: { name: ["=", "___NO_MATCH___"] }
                };
            }

            return {
                filters: [
                    ["Jumbo Paper Roll", "gsm", "=", frm.doc.job_gsm],
                    ["Jumbo Paper Roll", "status", "in", ["Available", "In Use"]]
                ]
            };
        });
    },
    sales_order(frm) {
        if (!frm.doc.sales_order) {
            frm.clear_table("slitted_roll_item");
            frm.refresh_field("slitted_roll_item");
            return;
        }

        frappe.call({
            method: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_slitted_items",
            args: {
                sales_order: frm.doc.sales_order
            },
            callback(r) {

                frm.clear_table("slitted_roll_item");

                (r.message || []).forEach(row => {
                    let child = frm.add_child("slitted_roll_item");

                    child.width = row.widthmm;
                    child.length = row.lengthm;
                    child.gsm = row.gsm;
                    child.qty = row.qty;
                    child.remaining_qty = row.remaining_qty;
                    child.delivery_date = row.delivery_date;
                });

                frm.refresh_field("slitted_roll_item");
            }
        });
    },
    
});
