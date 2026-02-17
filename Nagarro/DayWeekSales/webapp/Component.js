sap.ui.define([
    "sap/ui/core/UIComponent",
    "zsd_sales_week/model/models",
    "sap/ui/model/json/JSONModel",
], (UIComponent, models, JSONModel) => {
    "use strict";

    return UIComponent.extend("zsd_sales_week.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // enable routing
            this.getRouter().initialize();

            // Device / Filter / Operator / Table models
            var aOperators = [
                { Key: "EQ", Text: "=" },
                { Key: "NE", Text: "≠" },
                { Key: "GT", Text: ">" },
                { Key: "GE", Text: "≥" },
                { Key: "LT", Text: "<" },
                { Key: "LE", Text: "≤" },
                { Key: "BT", Text: "[ ]" }
            ];

            // Operator model
            this.setModel(new JSONModel(aOperators), "operators");

            // Filter model
            this.setModel(new JSONModel({}), "oFilterModel");

            // set the Table model
            this.setModel(new JSONModel([]), "oTableModel");

            // set the device model
            this.setModel(models.createDeviceModel(), "device");
        }
    });
});