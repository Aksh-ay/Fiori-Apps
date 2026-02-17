
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/Spreadsheet",
  "sap/m/MessageBox",
  "sap/m/ViewSettingsDialog",
  "sap/m/ViewSettingsItem",
  "sap/ui/model/Sorter",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/FilterType",
  "sap/m/SelectDialog",
  "sap/m/StandardListItem",
  "sap/m/Token",
  "sap/m/ActionSheet",
  "sap/m/Button",
  "sap/ui/core/format/NumberFormat"
], function (BaseController, JSONModel, Spreadsheet, MessageBox, ViewSettingsDialog, ViewSettingsItem,
  Sorter, Filter, FilterOperator, FilterType, SelectDialog, StandardListItem, Token, ActionSheet, Button, NumberFormat) {
  "use strict";
  return BaseController.extend("zsd_bal_ord_qty.controller.BalanceOrderQuantity", {
    /* ===========================
     * Lifecycle
     * =========================== */
    onInit: function () {
      // Hide side content initially
      var oDSC = this.byId("dsc");
      oDSC && oDSC.setShowSideContent(false);

      // Execution date
      var oExecutionDate = new Date();

      // Initial scope (store once)
      this._initialScope = {
        year: String(oExecutionDate.getFullYear()),
        month: String(oExecutionDate.getMonth() + 1).padStart(2, "0")
      };
      this._defaultTableData = [];

      var aOperators = [
        { Key: "EQ", Text: "=" },
        { Key: "NE", Text: "≠" },
        { Key: "GT", Text: ">" },
        { Key: "GE", Text: "≥" },
        { Key: "LT", Text: "<" },
        { Key: "LE", Text: "≤" },
        { Key: "BT", Text: "[ ]" }
      ];

      // View / Filter / Table models
      this.getView()
        .setModel(new JSONModel(aOperators), "operators")
        .setModel(new JSONModel([]), "oTableModel")
        .setModel(new JSONModel({
          MonthYear: new Date(),
          QtyFilters: {
            SOLength: { op: "EQ", v1: null, v2: null },
            AvgBasicPrice: { op: "EQ", v1: null, v2: null },
            ContractQty: { op: "EQ", v1: null, v2: null },
            SalesOrderQty: { op: "EQ", v1: null, v2: null },
            TotalBilledQty: { op: "EQ", v1: null, v2: null },
            DeliveryQty: { op: "EQ", v1: null, v2: null },
            BalanceBillQty: { op: "EQ", v1: null, v2: null }
          }
        }), "oFilterModel");

      // Initial fetch
      this._fetchTableData(this._initialScope.year, this._initialScope.month);
    },

    /* =========================================================== */
    /* Public handlers                                             */
    /* =========================================================== */
    onMonthYearChange: function (oEvent) {
      var sMonthYear = oEvent.getParameter("newValue");
      var [sMonth, sYear] = sMonthYear.split("-");
      this._resetFilterData(new Date(sYear, sMonth - 1, "01"));
      this._resetTableData();
      this._fetchTableData(sYear, sMonth);
    },

    onApplyFilters: function () {
      var oView = this.getView();
      var oFilterModel = oView.getModel("oFilterModel");
      var oTable = this.byId("idBalOrderQtyTable");
      var oBinding = oTable.getBinding("items");
      var aFilters = [];
      var oData = oFilterModel.getData() || {};

      /* ===============================
         1. MultiInput token filters
         =============================== */
      this._addMultiInputFilter(aFilters, "ContractNo");
      this._addMultiInputFilter(aFilters, "SalesOrderNo");
      this._addMultiInputFilter(aFilters, "SoldToParty");
      this._addMultiInputFilter(aFilters, "ShipToPartyName");
      this._addMultiInputFilter(aFilters, "MaterialNo");
      this._addMultiInputFilter(aFilters, "ProductCategoryDesc");
      this._addMultiInputFilter(aFilters, "CompanyName");
      this._addMultiInputFilter(aFilters, "PaymentTermText");
      this._addMultiInputFilter(aFilters, "ShippingTypeDesc");
      this._addMultiInputFilter(aFilters, "Currency");

      /* ===============================
         2. Quantity filters (generic loop)
         =============================== */
      var oQtyFilters = oData.QtyFilters || {};
      Object.keys(oQtyFilters).forEach(function (sField) {
        var oF = oQtyFilters[sField];
        if (!oF || !oF.op || oF.v1 === null || oF.v1 === undefined || oF.v1 === "") {
          return;
        }
        switch (oF.op) {
          case "EQ":
            aFilters.push(new Filter(sField, FilterOperator.EQ, oF.v1));
            break;
          case "NE":
            aFilters.push(new Filter(sField, FilterOperator.NE, oF.v1));
            break;
          case "GT":
            aFilters.push(new Filter(sField, FilterOperator.GT, oF.v1));
            break;
          case "GE":
            aFilters.push(new Filter(sField, FilterOperator.GE, oF.v1));
            break;
          case "LT":
            aFilters.push(new Filter(sField, FilterOperator.LT, oF.v1));
            break;
          case "LE":
            aFilters.push(new Filter(sField, FilterOperator.LE, oF.v1));
            break;
          case "BT":
            if (oF.v2 !== null && oF.v2 !== "" && oF.v2 !== undefined) {
              aFilters.push(
                new Filter(sField, FilterOperator.BT, oF.v1, oF.v2)
              );
            }
            break;
        }
      });

      /* ===============================
         3. Apply filters to table
         =============================== */
      oBinding.filter(aFilters, FilterType.Application);
    },

    onResetFilters: function () {
      this._resetFilterData();
      this._resetTableData();
    },

    onSyncTable: function () {
      this._resetFilterData();
      this._resetTableData();
      // Refresh Initial Data
      this._fetchTableData(this._initialScope.year, this._initialScope.month);
    },

    onGenericValueHelp: function (oEvent) {
      var oInput = oEvent.getSource();
      var sField = oInput.getCustomData().find(d => d.getKey() === "field").getValue();
      var sLabel = oInput.getCustomData().find(d => d.getKey() === "label").getValue();
      this._openValueHelpDialog(oInput, sField, sLabel);
    },

    /* =========================================================== */
    /* Internal helpers                                            */
    /* =========================================================== */
    _fetchTableData: function (sYear, sMonth) {
      this.byId("overviewPage").setBusy(true);
      this.getOwnerComponent().getModel().read("/ZSD_BALANCE_ORDER_QUANTITY(p_year='" + sYear + "',p_month='" + sMonth + "')/Set", {
        success: function (oData) {
          var aResults = oData.results || [];
          // Cache ONLY for Initial Date fetch request
          if (this._initialScope.year === sYear || this._initialScope.month === sMonth) {
            this._defaultTableData = aResults.slice(); // clone
          }
          // Update table model
          this.getView().getModel("oTableModel").setData(aResults);
          this.byId("overviewPage").setBusy(false);
        }.bind(this),
        error: function () {
          this.byId("overviewPage").setBusy(false);
          MessageBox.error("Failed to load data");
        }.bind(this)
      }
      );
    },

    _addMultiInputFilter: function (aFilters, sField) {
      var aInputs = this.getView().findAggregatedObjects(true, function (oControl) {
        return oControl.isA("sap.m.MultiInput") &&
          oControl.getCustomData().some(d => d.getKey() === "field" && d.getValue() === sField);
      });
      if (!aInputs.length) { return; }
      var aTokens = aInputs[0].getTokens();
      if (!aTokens.length) { return; }
      var aOrFilters = aTokens.map(function (oToken) {
        return new Filter(sField, FilterOperator.EQ, oToken.getKey());
      });
      aFilters.push(new Filter({ filters: aOrFilters, and: false }));
    },

    _resetFilterData: function (sDate) {
      var oView = this.getView();
      // Reset filter model 
      oView.getModel("oFilterModel").setData({
        MonthYear: sDate || new Date(),
        QtyFilters: {
          ContractQty: { op: "EQ", v1: null, v2: null },
          PrevMonthSales: { op: "EQ", v1: null, v2: null },
          CurrMonthSales: { op: "EQ", v1: null, v2: null },
          TotalBilledQty: { op: "EQ", v1: null, v2: null },
          BalanceBillQty: { op: "EQ", v1: null, v2: null },
          RolloverQty: { op: "EQ", v1: null, v2: null }
        }
      });

      // Clear MultiInput tokens
      oView.findAggregatedObjects(true, function (oCtrl) {
        return oCtrl.isA("sap.m.MultiInput");
      }).forEach(function (oMI) {
        oMI.removeAllTokens();
      });
    },

    _resetTableData: function () {
      // Clear binding filters
      this.byId("idBalOrderQtyTable").getBinding("items").filter([]);
      // Clear Sorting
      this._clearSort();
      // Restore first fetch snapshot
      this.getView().getModel("oTableModel").setData(this._defaultTableData.slice());
    },

    _openValueHelpDialog: function (oInput, sField, sLabel) {
      // Store current input reference
      this._oActiveMultiInput = oInput;
      // Build VH data dynamically from current table data
      var oBinding = this.byId("idBalOrderQtyTable").getBinding("items");
      if (!oBinding) { return; }
      // Get contexts AFTER filters are applied
      var aContexts = oBinding.getContexts(0, oBinding.getLength());
      // Extract only filtered rows
      var aTableData = aContexts.map(function (oCtx) {
        return oCtx.getObject();
      });
      var aVHData = Array.from(
        new Set(aTableData.map(r => r[sField]).filter(Boolean))
      ).map(v => ({ value: v }));

      var oVHModel = new JSONModel(aVHData);
      if (!this._oGenericVHDialog) {
        this._oGenericVHDialog = new SelectDialog({
          multiSelect: true,
          rememberSelections: true,
          items: {
            path: "/",
            template: new StandardListItem({
              title: "{value}"
            })
          },
          liveChange: this._onValueHelpSearch.bind(this),
          confirm: this._onValueHelpConfirm.bind(this)
        });
        this.getView().addDependent(this._oGenericVHDialog);
      }
      this._oGenericVHDialog.setTitle("Select " + sLabel);
      this._oGenericVHDialog.setModel(oVHModel);
      // preselect based on existing tokens
      this._preselectValueHelpItems();
      this._oGenericVHDialog.open();
    },

    _onValueHelpSearch: function (oEvent) {
      var sValue = oEvent.getParameter("value");
      var oFilter = new Filter("value", FilterOperator.Contains, sValue);
      var oBinding = oEvent.getSource().getBinding("items");
      oBinding.filter(sValue ? [oFilter] : []);
    },

    _preselectValueHelpItems: function () {
      var oDialog = this._oGenericVHDialog;
      var oInput = this._oActiveMultiInput;
      if (!oDialog || !oInput) { return; }
      var aTokens = oInput.getTokens();
      if (!aTokens.length) { return; }
      // Build lookup set of selected values
      var oTokenSet = new Set(
        aTokens.map(function (oToken) {
          return oToken.getKey(); // key == text in your case
        })
      );
      // Wait until items are rendered
      var oList = oDialog.getItems && oDialog.getItems().length ? oDialog : null;
      if (!oList) { return; }
      oDialog.getItems().forEach(function (oItem) {
        var sValue = oItem.getTitle(); // single-column VH
        oItem.setSelected(oTokenSet.has(sValue));
      });
    },

    _onValueHelpConfirm: function (oEvent) {
      var oInput = this._oActiveMultiInput; // correct input
      if (!oInput) { return; }
      var aSelectedItems = oEvent.getParameter("selectedItems") || [];
      oInput.removeAllTokens();
      aSelectedItems.forEach(function (oItem) {
        oInput.addToken(
          new Token({
            key: oItem.getTitle(),
            text: oItem.getTitle()
          })
        );
      });
      // Clear reference (safety)
      this._oActiveMultiInput = null;
    },

    /* ===========================
     * Export
     * =========================== */
    onExportExcel: function () {
      var oBinding = this.byId("idBalOrderQtyTable").getBinding("items");
      if (!oBinding) { return; }
      // Get contexts AFTER filters are applied
      var aContexts = oBinding.getContexts(0, oBinding.getLength());
      // Extract only filtered rows
      var aData = aContexts.map(function (oCtx) {
        return oCtx.getObject();
      });
      var aCols = this._createColumnConfig();

      var oSheet = new Spreadsheet({
        workbook: {
          columns: aCols, context: {
            sheetName: "BalanceOrder Quantity"
          }
        },
        dataSource: aData,
        fileName: "zsd_bal_order_qty.xlsx"
      });

      oSheet.build()
        .then(function () { oSheet.destroy(); })
        .catch(function (err) { MessageBox.error("Export failed: " + err); });
    },

    _createColumnConfig: function () {
      return [
        { label: "Year", property: "ContractYear", type: "string" },
        { label: "Month", property: "ContractMonth", type: "string" },
        { label: "Contract No", property: "ContractNo", type: "string" },
        { label: "Sales Order No", property: "SalesOrderNo", type: "string" },
        { label: "Sold-to Party No", property: "SoldToParty", type: "string" },
        { label: "Ship-to Party Name", property: "ShipToPartyName", type: "string" },
        { label: "Material No", property: "MaterialNo", type: "string" },
        { label: "SO-Length", property: "SOLength", type: "number" },
        { label: "Currency", property: "Currency", type: "string" },
        { label: "Avg Basic Price", property: "AvgBasicPrice", type: "number" },
        { label: "Contract Qty", property: "ContractQty", type: "number" },
        { label: "Sales Order Qty", property: "SalesOrderQty", type: "number" },
        { label: "Total Billed Qty", property: "TotalBilledQty", type: "number" },
        { label: "Delivery Qty", property: "DeliveryQty", type: "number" },
        { label: "Balance to Bill Qty", property: "BalanceBillQty", type: "number" }
      ];
    },

    /* ===========================
     * Side content toggle
     * =========================== */
    onToggleSideContent: function () {
      var oDSC = this.byId("dsc");
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMain");
      oBtnMain.setVisible(true);
      oDSC.setShowSideContent(!bShow);
    },

    onToggleMainContent: function () {
      var oDSC = this.byId("dsc");
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMain");
      oDSC.setShowSideContent(!bShow);
      oBtnMain.setVisible(false);
    },

    /* ===========================
     * Sort actions (wired to toolbar Sort button)
     * =========================== */
    onOpenSortDialog: function (oEvent) {
      var that = this;
      if (!this._oSortSheet) {
        this._oSortSheet = new ActionSheet({
          placement: "Bottom",
          buttons: [
            new Button({
              text: "Sort All Ascending",
              icon: "sap-icon://sort-ascending",
              press: function () { that._applySortAll(false); }
            }),
            new Button({
              text: "Sort All Descending",
              icon: "sap-icon://sort-descending",
              press: function () { that._applySortAll(true); }
            }),
            new Button({
              text: "Custom Sort…",
              icon: "sap-icon://action-settings",
              press: function () { that._openCustomSort(); }
            }),
            new Button({
              text: "Clear Sort",
              icon: "sap-icon://reset",
              type: "Transparent",
              press: function () { that._clearSort(); }
            })
          ]
        });
        this.getView().addDependent(this._oSortSheet);
      }
      var oSource = oEvent && oEvent.getSource ? oEvent.getSource() : this.byId("btnSort");
      this._oSortSheet.openBy(oSource);
    },

    _applySortAll: function (bDescending) {
      var aFieldsInOrder = [
        "ContractYear", "ContractMonth", "ContractNo", "SalesOrderNo", "SoldToParty", "ShipToPartyName",
        "MaterialNo", "SOLength", "Currency", "AvgBasicPrice", "ContractQty", "SalesOrderQty",
        "TotalBilledQty", "DeliveryQty", "BalanceBillQty"
      ];
      var aSorters = aFieldsInOrder.map(function (sPath) {
        return new Sorter(sPath, bDescending);
      });
      var oBinding = this.byId("idBalOrderQtyTable").getBinding("items");
      if (oBinding) {
        oBinding.sort(aSorters);
      }
    },

    _openCustomSort: function () {
      var that = this;
      if (!this._oVSD) {
        this._oVSD = new ViewSettingsDialog({
          sortDescending: false,
          confirm: function (oEvent) {
            var oItem = oEvent.getParameter("sortItem");
            var bDesc = oEvent.getParameter("sortDescending");
            if (oItem) {
              that._applySingleSort(oItem.getKey(), bDesc);
            }
          }
        });
        [
          new ViewSettingsItem({ text: "Year", key: "ContractYear" }),
          new ViewSettingsItem({ text: "Month", key: "ContractMonth" }),
          new ViewSettingsItem({ text: "Contract No", key: "ContractNo" }),
          new ViewSettingsItem({ text: "Sales Order No", key: "SalesOrderNo" }),
          new ViewSettingsItem({ text: "Sold-to Party No", key: "SoldToParty" }),
          new ViewSettingsItem({ text: "Ship-to Party Name", key: "ShipToPartyName" }),
          new ViewSettingsItem({ text: "Material No", key: "MaterialNo" }),
          new ViewSettingsItem({ text: "SO-Length", key: "SOLength" }),
          new ViewSettingsItem({ text: "Currency", key: "Currency" }),
          new ViewSettingsItem({ text: "Avg Basic Price", key: "AvgBasicPrice" }),
          new ViewSettingsItem({ text: "Contract Qty", key: "ContractQty" }),
          new ViewSettingsItem({ text: "Sales Order Qty", key: "SalesOrderQty" }),
          new ViewSettingsItem({ text: "Total Billed Qty", key: "TotalBilledQty" }),
          new ViewSettingsItem({ text: "Delivery Qty", key: "DeliveryrQty" }),
          new ViewSettingsItem({ text: "Balance to Bill Qty", key: "BalanceBillQty" })
        ].forEach(function (o) { that._oVSD.addSortItem(o); });
        this.getView().addDependent(this._oVSD);
      }
      this._oVSD.open();
    },

    _applySingleSort: function (sPath, bDescending) {
      var oBinding = this.byId("idBalOrderQtyTable").getBinding("items");
      if (oBinding) oBinding.sort([new Sorter(sPath, bDescending)]);
    },

    _clearSort: function () {
      var oBinding = this.byId("idBalOrderQtyTable").getBinding("items");
      if (oBinding) {
        oBinding.sort([]);
      }
    },

    /* ===========================
     * Hide / Show columns 
     * =========================== */
    onOpenColumnSettings: function () {
      var that = this;
      if (!this._pFieldDialog) {
        this._pFieldDialog = sap.ui.core.Fragment.load({
          name: "zsd_bal_ord_qty.view.fragments.ColumnSettings",
          controller: this
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          return oDialog;
        });
      }
      this._pFieldDialog.then(function (oDialog) {
        that._buildFieldList();
        oDialog.open();
      });
    },

    _buildFieldList: function () {
      var oTable = this.byId("idBalOrderQtyTable");
      var aColumns = oTable.getColumns();
      var oList = sap.ui.getCore().byId("fieldList");
      oList.removeAllItems();
      aColumns.forEach(function (oColumn, iIndex) {
        oList.addItem(
          new sap.m.StandardListItem({
            title: oColumn.getHeader().getText(),
            selected: oColumn.getVisible(),
            customData: [
              new sap.ui.core.CustomData({
                key: "colIndex",
                value: iIndex
              })
            ]
          })
        );
      });
      this.updateFieldCounter();
    },

    onFieldSearch: function (oEvent) {
      var sValue = oEvent.getParameter("newValue").toLowerCase();
      var oList = sap.ui.getCore().byId("fieldList");
      oList.getItems().forEach(function (oItem) {
        oItem.setVisible(
          oItem.getTitle().toLowerCase().includes(sValue)
        );
      });
    },

    onHideUnselected: function (oEvent) {
      var bHide = oEvent.getParameter("state");
      var oList = sap.ui.getCore().byId("fieldList");
      oList.getItems().forEach(function (oItem) {
        if (!oItem.getSelected()) {
          oItem.setVisible(!bHide);
        }
      });
    },

    updateFieldCounter: function () {
      var oList = sap.ui.getCore().byId("fieldList");
      var iSelected = oList.getSelectedItems().length;
      var iTotal = oList.getItems().length;
      sap.ui.getCore().byId("fieldCounterTitle")
        .setText("Field (" + iSelected + "/" + iTotal + ")");
    },

    updateFieldCounter: function () {
      var oList = sap.ui.getCore().byId("fieldList");
      var iSelected = oList.getSelectedItems().length;
      var iTotal = oList.getItems().length;
      sap.ui.getCore().byId("fieldCounterTitle").setText("Field (" + iSelected + "/" + iTotal + ")");
      sap.ui.getCore().byId("clearAllBtn").setEnabled(iSelected > 0);
    },

    onUnselectAll: function () {
      var oList = sap.ui.getCore().byId("fieldList");
      oList.removeSelections(true);
      this.updateFieldCounter();
    },

    onFieldConfirm: function () {
      var oTable = this.byId("idBalOrderQtyTable");
      var aColumns = oTable.getColumns();
      var oList = sap.ui.getCore().byId("fieldList");
      oList.getItems().forEach(function (oItem) {
        var iIndex = oItem.getCustomData()[0].getValue();
        aColumns[iIndex].setVisible(oItem.getSelected());
      });
      this._pFieldDialog.then(function (oDialog) {
        oDialog.close();
      });
    },

    onFieldCancel: function () {
      this._pFieldDialog.then(function (oDialog) {
        oDialog.close();
      });
    },

    /* ===========================
     * Formatters
     * =========================== */
    formatShortNumber: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      return this._toShort(n, 2);
    },

    formatShortCurrency: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      return this._toShort(n, 2);
    },

    formatFullNumber: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      var oFmt = NumberFormat.getFloatInstance({
        maxFractionDigits: 2,
        minFractionDigits: 0,
        groupingEnabled: true
      });
      return oFmt.format(n);
    },

    formatFullCurrency: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      var oFmt = NumberFormat.getFloatInstance({
        maxFractionDigits: 2,
        minFractionDigits: 2,
        groupingEnabled: true
      });
      return oFmt.format(n) + " USD";
    },

    /* Core K/M/B/T converter */
    _toShort: function (n, decimals) {
      var abs = Math.abs(n);
      var sign = n < 0 ? "-" : "";
      var d = (typeof decimals === "number") ? decimals : 2;

      function fmt(x) {
        var s = x.toFixed(d);
        s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
        return s;
      }

      if (abs >= 1e12) return sign + fmt(abs / 1e12) + "T";
      if (abs >= 1e9) return sign + fmt(abs / 1e9) + "B";
      if (abs >= 1e6) return sign + fmt(abs / 1e6) + "M";
      if (abs >= 1e3) return sign + fmt(abs / 1e3) + "K";

      var oFmt = NumberFormat.getFloatInstance({
        maxFractionDigits: d,
        minFractionDigits: 0,
        groupingEnabled: true
      });
      return sign + oFmt.format(abs);
    }
  });
});