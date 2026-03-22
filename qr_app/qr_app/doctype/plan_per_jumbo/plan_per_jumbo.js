// Copyright (c) 2026, surani and contributors
// For license information, please see license.txt

frappe.ui.form.on('Roll Allocation', {
    planned_count(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.roll_class && row.planned_count) {
            frappe.db.get_value('Roll Class', row.roll_class, 'lengthm')
                .then(r => {
                    let length = r.message.lengthm || 0;
                    frappe.model.set_value(cdt, cdn, 'planned_total_length',
                        row.planned_count * length
                    );
                });
        }
    }
});
