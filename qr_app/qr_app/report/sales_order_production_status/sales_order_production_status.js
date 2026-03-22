// Copyright (c) 2026, surani and contributors
// For license information, please see license.txt

frappe.query_reports["Sales Order Production Status"] = {
    filters: [

        {
            fieldname: "customer",
            label: "Customer",
            fieldtype: "Link",
            options: "Customer",

            on_change: function() {
                frappe.query_report.set_filter_value("sales_order", null);
                frappe.query_report.set_filter_value("gsm", null);
            }
        },

        {
            fieldname: "sales_order",
            label: "Sales Order",
            fieldtype: "Link",
            options: "Sales Order",

            get_query: function() {
                return {
                    filters: {
                        customer: frappe.query_report.get_filter_value("customer"),
                        docstatus: 1
                    }
                };
            },

            on_change: function() {

                const so = frappe.query_report.get_filter_value("sales_order");

                frappe.query_report.set_filter_value("gsm", null);

                if (!so) return;

                frappe.call({
                    method: "qr_app.qr_app.report.sales_order_production_status.sales_order_production_status.get_gsms",
                    args: {
                        sales_order: so
                    },
                    callback: function(r) {

                        const options = r.message || [];

                        const gsm_filter = frappe.query_report.get_filter("gsm");

                        gsm_filter.df.options = options.join("\n");

                        gsm_filter.refresh();
                    }
                });
            }
        },

        {
            fieldname: "gsm",
            label: "GSM",
            fieldtype: "Select",
            options: ""
        }

    ],
	formatter: function(value, row, column, data, default_formatter) {

        if (column.fieldname === "view_rolls") {

            return `<button class="btn btn-xs btn-primary view-rolls"
                data-so="${data.sales_order}"
                data-gsm="${data.gsm}">
                View Rolls
            </button>`;
        }

        return default_formatter(value, row, column, data);
    },

    onload: function(report) {

        $(document).on("click", ".view-rolls", function() {

            const so = $(this).data("so");
            const gsm = $(this).data("gsm");

            frappe.set_route("List", "Serial No", {
                sales_order: so,
                gsm: gsm
            });

        });

    }
};