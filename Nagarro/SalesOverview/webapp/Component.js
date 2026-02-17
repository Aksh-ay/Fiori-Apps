/**
 * eslint-disable @sap/ui5-jsdocs/no-jsdoc
 */

sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "zsd_sales_ovw/model/models",
    "sap/ui/model/json/JSONModel"
],
    function (UIComponent, Device, models, JSONModel) {
        "use strict";

        return UIComponent.extend("zsd_sales_ovw.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
             * @public
             * @override
             */
            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);

                // enable routing
                this.getRouter().initialize();

                // set the device model
                this.setModel(models.createDeviceModel(), "device");


                var oModel = new JSONModel();

                // Set model globally (available in entire app)
                this.setModel(oModel, "oGlobalModel");

                this.setModel(new sap.ui.model.json.JSONModel({
                    SalesData: [],
                    YearList: [],
                    QuarterList: [],
                    MonthList: [],
                    SourceMillList: [],
                    TypeOfSalesList: [],
                    ProductCategoryList: []
                }), "global");

            }
        });
    }
);