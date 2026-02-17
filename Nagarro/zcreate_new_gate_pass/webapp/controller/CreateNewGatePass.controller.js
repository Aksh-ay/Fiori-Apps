sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], (Controller, JSONModel) => {
    "use strict";

    return Controller.extend("zcreatenewgatepass.controller.CreateNewGatePass", {
        onInit() {
            this.getView().setModel(new JSONModel(),"createGatePass");
            this.getOwnerComponent().getRouter().getRoute("RouteCreateNewGatePass").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var startupParams = this.getOwnerComponent().getComponentData().startupParameters; // get Startup params from Owner Component
            if ((startupParams)) {
                var oData = {
                    "gpNo": startupParams.GPNo[0],
                    "plant": startupParams.Plant[0],
                    "gpType": startupParams.GPType[0],
                    "gpDate": startupParams.GPDate[0]
                };
                this.getView().getModel("createGatePass").setData(oData);
            }
        }    
    });
});