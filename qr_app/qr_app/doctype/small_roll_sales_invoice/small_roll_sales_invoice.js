// Copyright (c) 2025, surani and contributors
// For license information, please see license.txt

frappe.ui.form.on("Small Roll Sales Invoice", {
	refresh(frm) {
		if (frm.doc.docstatus > 0) {
			return;
		}

		frm.add_custom_button(__("Scan QR"), () => {
			frm.open_multi_scanner();
		});
	},

	onload(frm) {
		frm._processing = false;

		frm.process_scanned_code = async function (code) {
			if (this._processing || !code) {
				return;
			}

			const cleaned = code.trim();
			if (!cleaned) {
				return;
			}

			const already_added = (this.doc.items_table || []).some(
				(row) => row.small_paper_roll === cleaned
			);
			if (already_added) {
				frappe.show_alert({
					indicator: "orange",
					message: __("Roll {0} already added.", [cleaned]),
				});
				return;
			}

			this._processing = true;

			try {
				const { message } = await frappe.call({
					method: "qr_app.qr_app.doctype.small_roll_sales_invoice.small_roll_sales_invoice.get_roll_details_from_scan",
					args: {
						scan_text: cleaned,
						invoice: this.doc.name,
					},
					freeze: false,
				});

				if (!message) {
					frappe.show_alert({
						indicator: "red",
						message: __("Roll {0} not found.", [cleaned]),
					});
					return;
				}

				const exists_now = (this.doc.items_table || []).some(
					(row) => row.small_paper_roll === message.name
				);
				if (exists_now) {
					frappe.show_alert({
						indicator: "orange",
						message: __("Roll {0} already added.", [message.name]),
					});
					return;
				}

				if (message.already_linked_to?.length) {
					frappe.show_alert({
						indicator: "orange",
						message: __("Roll {0} is linked to {1}.", [
							message.name,
							message.already_linked_to.join(", "),
						]),
					});
				}

				const row = this.add_child("items_table");
				row.small_paper_roll = message.name;
				row.gsm = message.gsm;
				row.width_mm = message.width_mm;
				row.length_m = message.length_m;
				row.weight_kg = message.weight_kg;

				this.refresh_field("items_table");
				frappe.show_alert({
					indicator: "green",
					message: __("Added roll {0}.", [message.name]),
				});
			} catch (err) {
				console.error(err);
				frappe.show_alert({
					indicator: "red",
					message: __("Failed to fetch roll {0}.", [cleaned]),
				});
			} finally {
				this._processing = false;
			}
		};

		frm.open_multi_scanner = function () {
			new frappe.ui.Scanner({
				dialog: true,
				multiple: true,
				on_scan(data) {
					const scanned =
						data?.result?.text ||
						data?.decodedText ||
						data?.text ||
						"";
					if (scanned) {
						frm.process_scanned_code(scanned);
					}
				},
				on_error(error) {
					console.warn("Scanner error:", error);
				},
			});
		};
	},

});
