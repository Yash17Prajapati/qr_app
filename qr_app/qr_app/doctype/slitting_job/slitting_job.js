// Copyright (c) 2025, surani and contributors
// For license information, please see license.txt
function load_remaining_items(frm) {
    if (!frm.doc.sales_order || !frm.doc.job_gsm) return;

    frappe.call({
        method: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_remaining_items_for_gsm",
        args: {
            sales_order: frm.doc.sales_order,
            gsm: frm.doc.job_gsm
        },
        callback(r) {
            // ❌ DO NOT clear immediately

            if (!r.message || !r.message.length) {
                // Keep existing rows if any
                frappe.msgprint(
                    "No remaining quantity found for this GSM."
                );
                return;
            }

            // Only clear when we KNOW we have rows
            frm.clear_table("slitted_roll_item");

            r.message.forEach(item => {
                let row = frm.add_child("slitted_roll_item");
                row.gsm = item.gsm;
                row.width = item.width;
                row.length = item.length;
                row.qty = item.qty;
                row.produced_quantity = 0;
            });

            frm.refresh_field("slitted_roll_item");
        }
    });
}

function load_slitted_items(frm) {
    if (!frm.doc.sales_order || !frm.doc.job_gsm) return;

    frappe.call({
        method: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_slitted_items_with_remaining",
        args: {
            sales_order: frm.doc.sales_order,
            gsm: frm.doc.job_gsm
        },
        callback(r) {
            if (!r.message) return;

            frm.clear_table("slitted_roll_item");

            r.message.forEach(row => {
                let child = frm.add_child("slitted_roll_item");
                child.width = row.width;
                child.length = row.length;
                child.gsm = row.gsm;
                child.qty = row.qty;
                child.remaining_qty = row.remaining_qty;
                child.produced_quantity = 0; // THIS JOB ONLY
            });

            frm.refresh_field("slitted_roll_item");
        }
    });
}

frappe.ui.form.on("Slitting Job", {
    // refresh(frm) {
    //     if (
    //         frm.doc.docstatus === 1 &&
    //         ["Jumbo Finished", "Completed"].includes(frm.doc.job_status)
    //     ) {
    //         frappe.call({
    //             method: "qr_app.qr_app.doctype.slitting_job.slitting_job.has_remaining_qty",
    //             args: {
    //                 slitting_job: frm.doc.name
    //             },
    //             callback(r) {
    //                 if (r.message === true) {
    //                     frm.add_custom_button(
    //                         "Create Next Slitting Job",
    //                         () => {
    //                             frappe.call({
    //                                 method: "qr_app.qr_app.doctype.slitting_job.slitting_job.create_next_slitting_job",
    //                                 args: {
    //                                     slitting_job: frm.doc.name
    //                                 },
    //                                 callback(res) {
    //                                     if (res.message) {
    //                                         frappe.set_route("Form", "Slitting Job", res.message);
    //                                     }
    //                                 }
    //                             });
    //                         }
    //                     );
    //                 }
    //             }
    //         });
    //     }
    //     if(frm.doc.is_system_created){
    //         frm.set_df_property("sales_order", "read_only", 1);
    //     } else {
    //         frm.set_df_property("sales_order", "read_only", 0);
    //     }
    // },
    refresh(frm){
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
        frm.set_query("sales_order", function () {
            return {
                filters: {
                    docstatus: 1,
                    status: ["in", ["To Deliver", "To Deliver and Bill"]]
                }
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
            frm.set_value("job_gsm", null);
            frm.set_df_property("job_gsm", "description", "");
            return;
        }

        frappe.call({
            method: "qr_app.qr_app.doctype.slitting_job.slitting_job.get_pending_gsm_list",
            args: {
                sales_order: frm.doc.sales_order
            },
            callback(r) {
                if (r.message && r.message.length) {
                    // Show hint to user
                    frm.set_df_property(
                        "job_gsm",
                        "description",
                        "Available GSMs to produce: " + r.message.join(", ")
                    );
                } else {
                    frm.set_df_property(
                        "job_gsm",
                        "description",
                        "No GSM pending for this Sales Order"
                    );
                }
            }
        });
    },
    job_gsm(frm) {
        // if (!frm.doc.sales_order || !frm.doc.job_gsm) return;

        // frm.clear_table("slitted_roll_item");

        // frappe.db.get_doc("Sales Order", frm.doc.sales_order).then(so => {
        //     (so.items || []).forEach(item => {
        //         if (item.gsm == frm.doc.job_gsm) {
        //             let row = frm.add_child("slitted_roll_item");
        //             row.gsm = item.gsm;
        //             row.width = item.widthmm;
        //             row.length = item.lengthm;
        //             row.qty = item.qty;
        //             row.remaining_qty=row.qty;
        //         }
        //     });

        //     frm.refresh_field("slitted_roll_item");
        // });
        load_slitted_items(frm);
    }
});
