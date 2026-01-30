// Copyright (c) 2025, surani and contributors
// For license information, please see license.txt

frappe.ui.form.on("Small Paper Roll", {
	refresh(frm) {
		if (!frm.is_new()) {
			frm.page.set_secondary_action(__("Print"), () => {
				frappe.call({
					method: "qr_app.qr_app.doctype.small_paper_roll.small_paper_roll.get_qr_print_html",
					args: { name: frm.doc.name },
					callback: (r) => {
						if (!r.message) {
							return;
						}
						const w = window.open("", "_blank");
						w.document.write(r.message);
						w.document.close();
						w.focus();
						w.print();
					}
				});
			});
		}
	},
});
