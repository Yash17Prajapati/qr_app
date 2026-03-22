// Copyright (c) 2026, surani and contributors
// For license information, please see license.txt

frappe.ui.form.on('Operator Job', {
    refresh(frm) {

        frm.add_custom_button('Produce Small Roll', function () {

            // 🔥 Build dropdown from production_item
            let options = (frm.doc.production_item || []).map(row => {
                return {
                    label: `${row.widthmm} mm × ${row.lengthm} m (${row.gsm} GSM) — Qty: ${row.qty_to_produce}`,
                    value: JSON.stringify(row)
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
                        options: options.map(o => o.label),
                        reqd: 1
                    },
                    {
                        label: "Jumbo Roll ID",
                        fieldname: "jumbo_roll_id",
                        fieldtype: "Data",
                        read_only: 0
                    },
                    {
                        label: "Quantity",
                        fieldname: "qty",
                        fieldtype: "Int",
                        default: 1,
                        reqd: 1
                    },
                    {
                        fieldname: "rolls_html",
                        fieldtype: "HTML"
                    }
                ],

                primary_action_label: "Create Rolls",

                primary_action(values) {

                    if (!values.cut_size) {
                        frappe.msgprint("Select cut size");
                        return;
                    }

                    let selected = options.find(o => o.label === values.cut_size);
                    let data = JSON.parse(selected.value);

                    let max_qty = data.qty_to_produce;

                    if (values.qty > max_qty) {
                        frappe.msgprint(`You can only produce ${max_qty} rolls`);
                        return;
                    }

                    let rolls = [];
                    let invalid = false;

                    dialog.$wrapper.find(".roll-row").each(function () {

                        let width = parseFloat($(this).find(".roll-width").val());
                        let length = parseFloat($(this).find(".roll-length").val());
                        let weight = parseFloat($(this).find(".roll-weight").val());

                        if (!width || !length || !weight || weight <= 0) {
                            invalid = true;
                        }

                        rolls.push({
                            widthmm: width,
                            lengthm: length,
                            weight: weight
                        });
                    });

                    if (invalid) {
                        frappe.msgprint("Enter valid width, length and weight");
                        return;
                    }
                    let serials = dialog.serials || [];

    frappe.call({
        method: "qr_app.qr_app.doctype.operator_job.operator_job.produce_operator_rolls",
        args: {
            operator_job: frm.doc.name,
            jumbo_roll_id: values.jumbo_roll_id,
            rolls: rolls,
            serials: serials
        },
        freeze: true,
        freeze_message: "Creating Rolls...",
        callback: function (r) {

            if (!r.exc) {
                dialog.hide();

                frappe.show_alert({
                    message: "Rolls Created Successfully",
                    indicator: "green"
                });

                // 🔥 Reload to show updated data
                frm.reload_doc();
            }
        }
    });

                    // 🔥 Add rows to child table
                    rolls.forEach(r => {

                        let child = frm.add_child("rolls_manufactured");

                        child.gsm = data.gsm;
                        child.widthmm = r.widthmm;
                        child.lengthm = r.lengthm;
                        child.jumbo_roll = data.jumbo_roll;

                        child.id = "SPR-" + frappe.utils.get_random(5).toUpperCase();
                        child.weight = r.weight;

                    });

                    frm.refresh_field("rolls_manufactured");

                    dialog.hide();

                    // frappe.show_alert({
                    //     message: "Rolls Created Successfully",
                    //     indicator: "green"
                    // });

                }
            });

            dialog.show();

            // 🔥 Generate dynamic inputs
            function generate_inputs() {

    let qty = dialog.get_value("qty") || 0;

    // 🔥 Initialize storage
    if (!dialog.roll_store) dialog.roll_store = [];
    if (!dialog.serials) dialog.serials = [];

    // 🔥 Save existing values BEFORE redraw
    dialog.$wrapper.find(".roll-row").each(function () {

        let idx = $(this).data("index");

        dialog.roll_store[idx] = {
            width: $(this).find(".roll-width").val(),
            length: $(this).find(".roll-length").val(),
            weight: $(this).find(".roll-weight").val()
        };

    });

    // 🔥 Preserve serials (only generate new if needed)
    while (dialog.serials.length < qty) {
        dialog.serials.push("SPR-" + frappe.utils.get_random(4).toUpperCase());
    }

    let selected = options.find(o => o.label === dialog.get_value("cut_size"));

    let default_width = "", default_length = "", jumbo = "";

    if (selected) {
        let data = JSON.parse(selected.value);

        default_width = data.widthmm;
        default_length = data.lengthm;
        jumbo = data.jumbo_roll;

        dialog.set_value("jumbo_roll_id", jumbo);
    }

    let html = `<div style="margin-top:10px">`;

    for (let i = 0; i < qty; i++) {

        let stored = dialog.roll_store[i] || {};

        let width = stored.width || default_width;
        let length = stored.length || default_length;
        let weight = stored.weight || "";

        let serial = dialog.serials[i];

        html += `
            <div class="roll-row" data-index="${i}"
                style="display:flex; gap:8px; margin-bottom:8px">

                <b style="width:120px">${serial}</b>

                <input type="number"
                    class="roll-width form-control"
                    value="${width}"
                    style="width:80px"/>

                <span>mm ×</span>

                <input type="number"
                    class="roll-length form-control"
                    value="${length}"
                    style="width:90px"/>

                <span>m</span>

                <input type="number"
                    class="roll-weight form-control"
                    value="${weight}"
                    placeholder="Weight (kg)"
                    style="width:120px"/>
            </div>
        `;
    }

    html += `</div>`;

    dialog.fields_dict.rolls_html.$wrapper.html(html);
}

            dialog.fields_dict.qty.$input.on("input", generate_inputs);
            dialog.fields_dict.cut_size.$input.on("change", generate_inputs);

            generate_inputs();
        });
    }
});

frappe.ui.form.on("Manufactured Items", {
    print_qr(frm, cdt, cdn) {

    let row = locals[cdt][cdn];

    if (!row.gross_weight || parseFloat(row.gross_weight) <= 0) {
        frappe.throw("Gross Weight must be entered before printing QR.");
    }

    function download_pdf() {

        const url = `/api/method/qr_app.qr_app.doctype.operator_job.operator_job.get_qr_pdf?operator_job=${encodeURIComponent(frm.doc.name)}&row_name=${encodeURIComponent(row.name)}`;

        // 🔥 Hidden iframe (no tab, no navigation)
        let iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url;

        document.body.appendChild(iframe);

        // cleanup (optional but good practice)
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 5000);

        // ✅ Success message
        frappe.show_alert({
            message: `QR printed for Serial No: ${row.id}`,
            indicator: "green"
        });
    }

    // First time printing
    if (!row.qr_printed) {

        download_pdf();

        row.qr_printed = 1;
        frm.refresh_field("rolls_manufactured");

        return;
    }

    // Already printed → ask confirmation
    frappe.confirm(
        `QR for Serial No ${row.id} was already printed. Print again?`,
        function () {
            download_pdf();
        },
        function () {
            frappe.msgprint("Printing cancelled.");
        }
    );
}
});