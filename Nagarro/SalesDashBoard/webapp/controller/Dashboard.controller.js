
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/m/Dialog"
], function (Controller, MessageToast, Fragment, JSONModel, Dialog) {
  "use strict";

  return Controller.extend("zsd_sales_dash.controller.Dashboard", {
    onInit: function () {

      var oView = this.getView();

      this.oGlobalModel = this.getOwnerComponent().getModel("oGlobalModel");

      var Tiles =
        [
          {
            "title": "Sales Overview",
            "subheader": "Open Sales app overview",
            "icon": "sap-icon://sales-order",
            "semanticObject": "ZSALES",
            "action": "overview",
            "params": {
            }
          },
          {
            "title": "Sales Ranking",
            "subheader": "Rank Sales based on Country and Shipt to party",
            "icon": "sap-icon://sales-order",
            "semanticObject": "ZSALES",
            "action": "overview",
            "params": {
            }
          }
        ];
      this.oGlobalModel.setProperty('/tiles', Tiles)
      this.oGlobalModel.refresh(true)

      // 1) Hardcoded pie data

      // Example setup in your controller
      this.getView().setModel(new sap.ui.model.json.JSONModel({
        data: [
          { label: "Target", value: 1200 },
          { label: "Actual", value: 950 }
        ]
      }), "pieModelCategory");

      this.getView().setModel(new sap.ui.model.json.JSONModel({
        data: [
          { label: "Jan", value: 200 },
          { label: "Feb", value: 180 },
          // ...
        ]
      }), "pieModelMonth");

      this.getView().setModel(new sap.ui.model.json.JSONModel({
        data: [
          { label: "JSS", value: 520 },
          { label: "SS", value: 430 },
          { label: "Other", value: 150 }
        ]
      }), "pieModelCompany");

      // oView.setModel(oPieData, "pieModel");
      if (!this._oSalesPieDialog) {
        this._oSalesPieDialog = sap.ui.xmlfragment(
          this.getView().getId(),
          "zsd_sales_dash.fragment.SalesTargetPie",
          this
        );
        this.getView().addDependent(this._oSalesPieDialog);
      }
     // this._oSalesPieDialog.open();
    },



    openSalesPieDialog: function () {

    },

    /**
     * Close handler (explicit close button or programmatic)
     */
    _closeSalesPieDialog: function () {
      if (this._oSalesPieDialog) {
        this._oSalesPieDialog.close();
      }
    },

    /**
     * Attach click listener to the block layer to close dialog when clicking outside.
     * Called on dialog 'afterOpen'.
     */
    _attachOutsideClickToClose: function () {
      // Find the block layer element in the static area
      var oStaticArea = sap.ui.getCore().getStaticAreaRef();
      if (!oStaticArea) { return; }

      // The block layer has class 'sapUiBLy'. There may be multiple; pick the last (topmost).
      var aLayers = oStaticArea.querySelectorAll(".sapUiBLy");
      var oTopLayer = aLayers && aLayers.length ? aLayers[aLayers.length - 1] : null;
      if (!oTopLayer) { return; }

      // Store listener so we can detach later
      this._fnOutsideClick = function (evt) {
        // Optional: ensure the click is actually the overlay (not a child)
        if (evt.target.classList.contains("sapUiBLy")) {
          this._closeSalesPieDialog();
        }
      }.bind(this);

      oTopLayer.addEventListener("click", this._fnOutsideClick);
      // Also allow closing via tapping on mobile
      oTopLayer.addEventListener("touchstart", this._fnOutsideClick);
    },

    /**
     * Detach listeners after dialog closes to avoid leaks.
     * Called on dialog 'afterClose'.
     */
    _detachOutsideClickListener: function () {
      var oStaticArea = sap.ui.getCore().getStaticAreaRef();
      if (!oStaticArea || !this._fnOutsideClick) { return; }

      var aLayers = oStaticArea.querySelectorAll(".sapUiBLy");
      var oTopLayer = aLayers && aLayers.length ? aLayers[aLayers.length - 1] : null;
      if (oTopLayer) {
        oTopLayer.removeEventListener("click", this._fnOutsideClick);
        oTopLayer.removeEventListener("touchstart", this._fnOutsideClick);
      }
      this._fnOutsideClick = null;
    },

    /**
     * Optional: Destroy dialog instance on exit
     */
    onExit: function () {
      if (this._oSalesPieDialog) {
        this._oSalesPieDialog.destroy();
        this._oSalesPieDialog = null;
      }
    },


    onTilePress: function (oEvent) {
      var TileText = oEvent.getSource()._oTitle.getText();
      var semObj = 'ZSALES';
      var SemAction = 'overview';
      switch (TileText) {
        case 'Sales Overview':
          var semObj = 'ZSALES';
          var SemAction = 'OVERVIEW';
          break;
        case 'Sales Ranking':
          var semObj = 'ZSALES';
          var SemAction = 'RANK';
          break;
        case 'Roll Over Quantity':
          var semObj = 'ZSALES';
          var SemAction = 'ROLLQTY';
          break;
        case 'Sales Invoice':
          var semObj = 'ZSALES';
          var SemAction = 'INVOICE';
          break;
        case 'Day Week Wise Sales':
          var semObj = 'ZSALES';
          var SemAction = 'DAYWEEK';
          break;
        case 'Balance Order Quantity':
          var semObj = 'ZSALES';
          var SemAction = 'BALQTY';
          break;
        default:
          break;
      }
      var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
      var hash = (oCrossAppNavigator && oCrossAppNavigator.hrefForExternal({
        target: {
          semanticObject: semObj,
          action: SemAction
        }
      })) || "";

      // Navigate to the target application
      oCrossAppNavigator.toExternal({
        target: {
          shellHash: hash
        }
      });
    }

  });
});
