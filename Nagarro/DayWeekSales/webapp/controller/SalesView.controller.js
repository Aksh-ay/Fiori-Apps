sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("zsd_sales_week.controller.SalesView", {

        /* ===========================
         * Lifecycle
         * =========================== */
        onInit: function () { },

        onTabSelect: function () {
            // Reset Filter model
            this.getOwnerComponent().getModel("oFilterModel").setProperty("/QtyFilters", {
                USDWtPrice: { op: "EQ", v1: null, v2: null },
                SumOfQuantity: { op: "EQ", v1: null, v2: null }
            });
        }
    });
});