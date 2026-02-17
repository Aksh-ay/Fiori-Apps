
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/Spreadsheet",
  "sap/m/MessageBox",
  "sap/m/ActionSheet",
  "sap/m/Button",
  "sap/m/ViewSettingsDialog",
  "sap/m/ViewSettingsItem",
  "sap/ui/model/Sorter",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "sap/ui/core/format/NumberFormat"
], function (
  BaseController, JSONModel, Spreadsheet, MessageBox,
  ActionSheet, Button, ViewSettingsDialog, ViewSettingsItem,
  Sorter, Filter, FilterOperator, MessageToast, NumberFormat
) {
  "use strict";

  return BaseController.extend("zsd_sales_inv.controller.Main", {

    /* ========================
     * LIFECYCLE
     * ======================== */
    onInit: function () {
      // View model for numeric filter blocks & chip support
      var oViewModel = new JSONModel({
        qty: { op: "", v1: "", v2: "" },
        basic: { op: "", v1: "", v2: "" },
        vat: { op: "", v1: "", v2: "" },
        inv: { op: "", v1: "", v2: "" },
        pieces: { op: "", v1: "", v2: "" },

        filterChips: [],
        filterChipsTop: [],
        filterChipsBottom: [],
        filterSummary: ""
      });
      this.getView().setModel(oViewModel, "view");

      var oDSC = this.byId("dsc");
      oDSC && oDSC.setShowSideContent(false);

      this.oGlobalModel = this.getOwnerComponent().getModel("oGlobalModel");
      this.zsd_sales_invModel = this.getOwnerComponent().getModel("zsd_sales_invModel");
      this.salesTable = this.byId("salesTable");

      this.onCallCurrentYearInvoice();
      this._wireLiveFilterEvents();
    },

    /* ========================
     * HELPERS
     * ======================== */
    _toNum: function (v) {
      if (v === null || v === undefined || v === "") return 0;
      var n = Number(String(v).replace(/,/g, ""));
      return isFinite(n) ? n : 0;
    },

    _toYMD: function (oDate) {
      if (!oDate) return "";
      var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
      return oDate.getFullYear() + pad(oDate.getMonth() + 1) + pad(oDate.getDate());
    },

    _normalizeRow: function (r) {
      // Keep backend field names used by the View bindings; normalize numbers
      return {
        Zyear: r.Zyear,
        Quarter: r.Quarter,
        Zmonth: r.Zmonth,

        BillNo: r.BillNo,
        BillDate: r.BillDate,             // YYYYMMDD (string)

        ContractNo: r.ContractNo,
        SoNo: r.SoNo,
        DeliveryNo: r.DeliveryNo,

        Material: r.Material,
        Currecny: r.Currecny,             // spelling from service

        Quantity: this._toNum(r.Quantity),
        BasicValue: this._toNum(r.BasicValue),
        VatValue: this._toNum(r.VatValue),
        TotalInvValue: this._toNum(r.TotalInvValue),

        NoOfPieces: this._toNum(r.NoOfPieces),
        VehicleNumber: r.VehicleNumber || "",

        LastDate: r.LastDate               // YYYYMMDD (string)
      };
    },

    /* ========================
     * DATA LOAD
     * ======================== */
    onCallCurrentYearInvoice: function () {
      var that = this;
      this.salesTable && this.salesTable.setBusy(true);

      this.zsd_sales_invModel.read("/SalesInvoiceSet", {
        success: function (oData) {
          var aRaw = (oData && oData.results) || [];
          var aNorm = aRaw.map(that._normalizeRow.bind(that));

          that.oGlobalModel.setProperty("/SalesData", aNorm);
          that._refreshValueHelps();

          that.salesTable && that.salesTable.setBusy(false);
          that._updateFilterSummaryAndChips();
        },
        error: function () {
          that.salesTable && that.salesTable.setBusy(false);
          MessageBox.error("Failed to load data.");
        }
      });
    },

    onSyncInvoice: function () {
      this.onCallCurrentYearInvoice();
    },

    /* ========================
     * VALUE HELPS (for all columns)
     * ======================== */
    _refreshValueHelps: function () {
      var aData = this.oGlobalModel.getProperty("/SalesData") || [];
      var uniqSorted = function (mapper) {
        return Array.from(
          new Set((aData || []).map(mapper).filter(function (v) {
            return v !== undefined && v !== null && v !== "";
          }))
        ).sort(function (a, b) { return String(a).localeCompare(String(b)); });
      };
      var mapList = function (arr) { return arr.map(function (v) { return ({ key: String(v), text: String(v) }); }); };

      var aYear = uniqSorted(function (r) { return r.Zyear; });
      var aQuarter = uniqSorted(function (r) { return r.Quarter; });
      var aMonth = uniqSorted(function (r) { return r.Zmonth; });

      // Ensure lists are never empty
      if (!aQuarter.length) aQuarter = ["Q1", "Q2", "Q3", "Q4"];
      if (!aMonth.length) aMonth = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

      var aBill = uniqSorted(function (r) { return r.BillNo; });
      var aContract = uniqSorted(function (r) { return r.ContractNo; });
      var aSo = uniqSorted(function (r) { return r.SoNo; });
      var aDelivery = uniqSorted(function (r) { return r.DeliveryNo; });
      var aMaterial = uniqSorted(function (r) { return r.Material; });
      var aCurr = uniqSorted(function (r) { return r.Currecny; });
      var aVehicle = uniqSorted(function (r) { return r.VehicleNumber; });

      this.oGlobalModel.setProperty("/YearList", mapList(aYear));
      this.oGlobalModel.setProperty("/QuarterList", mapList(aQuarter));
      this.oGlobalModel.setProperty("/MonthList", mapList(aMonth));
      this.oGlobalModel.setProperty("/BillNoList", mapList(aBill));
      this.oGlobalModel.setProperty("/ContractList", mapList(aContract));
      this.oGlobalModel.setProperty("/SoList", mapList(aSo));
      this.oGlobalModel.setProperty("/DeliveryList", mapList(aDelivery));
      this.oGlobalModel.setProperty("/MaterialList", mapList(aMaterial));
      this.oGlobalModel.setProperty("/CurrencyList", mapList(aCurr));
      this.oGlobalModel.setProperty("/VehicleList", mapList(aVehicle));
    },

    /* ========================
     * EXPORT
     * ======================== */
    onExportExcel: function () {
      var aData = this.getOwnerComponent().getModel("oGlobalModel").getProperty("/SalesData") || [];
      var oSheet = new Spreadsheet({
        workbook: { columns: this._createColumnConfig() },
        dataSource: aData,
        fileName: "zsd_sales_invs.xlsx"
      });
      oSheet.build().then(function () { oSheet.destroy(); })
        .catch(function (err) { MessageBox.error("Export failed: " + err); });
    },

    _createColumnConfig: function () {
      return [
        { label: "Year", property: "Zyear", type: "string" },
        { label: "Quarter", property: "Quarter", type: "string" },
        { label: "Month", property: "Zmonth", type: "string" },

        { label: "Invoice No", property: "BillNo", type: "string" },
        { label: "Invoice Date (YMD)", property: "BillDate", type: "string" },

        { label: "Contract No", property: "ContractNo", type: "string" },
        { label: "SO No", property: "SoNo", type: "string" },
        { label: "Delivery No", property: "DeliveryNo", type: "string" },

        { label: "Material", property: "Material", type: "string" },
        { label: "Currency", property: "Currecny", type: "string" },

        { label: "Quantity", property: "Quantity", type: "number" },
        { label: "Basic Value", property: "BasicValue", type: "number" },
        { label: "VAT Value", property: "VatValue", type: "number" },
        { label: "Total Invoice Value", property: "TotalInvValue", type: "number" },

        { label: "Pieces", property: "NoOfPieces", type: "number" },
        { label: "Vehicle No", property: "VehicleNumber", type: "string" },
        { label: "Last Update (YMD)", property: "LastDate", type: "string" }
      ];
    },

    /* ========================
     * SIDE CONTENT TOGGLE
     * ======================== */
    onToggleSideContent: function () {
      var oDSC = this.byId("dsc");
      if (!oDSC) return;
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMain");
      oBtnMain && oBtnMain.setVisible(true);
      oDSC.setShowSideContent(!bShow);
    },

    onToggleMainContent: function () {
      var oDSC = this.byId("dsc");
      if (!oDSC) return;
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMain");
      oDSC.setShowSideContent(!bShow);
      oBtnMain && oBtnMain.setVisible(false);
    },

    /* ========================
     * FILTER BUILDERS
     * ======================== */

    _buildYearMonthFilter: function () {
      var oDP = this.byId("fYearMonth");
      if (!oDP) return null;

      var sVal = oDP.getValue(); // respects valueFormat => 'yyyyMM'
      if (!sVal || !/^\d{6}$/.test(sVal)) return null;

      var sYear = sVal.substring(0, 4);
      var sMonth = sVal.substring(4, 6); // already zero-padded

      // Enforce both Zyear AND Zmonth
      return new Filter({
        filters: [
          new Filter("Zyear", FilterOperator.EQ, sYear),
          new Filter("Zmonth", FilterOperator.EQ, sMonth)
        ],
        and: true
      });
    },

    _buildOrFilter: function (sPath, aKeys) {
      if (!aKeys || !aKeys.length) return null;
      return new Filter({
        filters: aKeys.map(function (k) { return new Filter(sPath, FilterOperator.EQ, k); }),
        and: false
      });
    },

    _buildNumberFilter: function (sPath, cfg) {
      if (!cfg || !cfg.op) return null;
      var parse = function (v) {
        if (v === "" || v === null || v === undefined) return NaN;
        var n = Number(v);
        return isFinite(n) ? n : NaN;
      };
      var n1 = parse(cfg.v1);

      switch (cfg.op) {
        case "EQ": return isNaN(n1) ? null : new Filter(sPath, FilterOperator.EQ, n1);
        case "NE": return isNaN(n1) ? null : new Filter(sPath, FilterOperator.NE, n1);
        case "GT": return isNaN(n1) ? null : new Filter(sPath, FilterOperator.GT, n1);
        case "GE": return isNaN(n1) ? null : new Filter(sPath, FilterOperator.GE, n1);
        case "LT": return isNaN(n1) ? null : new Filter(sPath, FilterOperator.LT, n1);
        case "LE": return isNaN(n1) ? null : new Filter(sPath, FilterOperator.LE, n1);
        case "BT": {
          var n2 = parse(cfg.v2);
          if (isNaN(n1) || isNaN(n2)) return null;
          var low = Math.min(n1, n2), high = Math.max(n1, n2);
          return new Filter(sPath, FilterOperator.BT, low, high);
        }
        default: return null;
      }
    },

    _buildDateRangeFilter: function (sPath, oDRS) {
      if (!oDRS || !oDRS.getDateValue || !oDRS.getSecondDateValue) return null;
      var d1 = oDRS.getDateValue();
      var d2 = oDRS.getSecondDateValue();
      if (!d1 || !d2) return null;

      var ymd1 = this._toYMD(d1);
      var ymd2 = this._toYMD(d2);
      if (!ymd1 || !ymd2) return null;

      var low = ymd1 <= ymd2 ? ymd1 : ymd2;
      var high = ymd2 >= ymd1 ? ymd2 : ymd1;
      // Filtering against backend-format strings (YYYYMMDD) present in model
      return new Filter(sPath, FilterOperator.BT, low, high);
    },

    /* ========================
     * APPLY / RESET FILTERS
     * ======================== */

    onApplyFilters: function () {
      var aFilters = [];

      // NEW: Year–Month filter (DatePicker)
      var fYM = this._buildYearMonthFilter();
      if (fYM) aFilters.push(fYM);

      var getKeys = function (id) {
        var o = this.byId(id);
        return (o && o.getSelectedKeys) ? o.getSelectedKeys() : [];
      }.bind(this);

      var pushOr = function (path, id) {
        var f = this._buildOrFilter(path, getKeys(id));
        if (f) aFilters.push(f);
      }.bind(this);

      // Remove pushOr("Zyear", "fYear");  // <— removed
      pushOr("Quarter", "fQuarter");
      pushOr("Zmonth", "fMonth");
      pushOr("BillNo", "fBillNo");
      pushOr("ContractNo", "fContract");
      pushOr("SoNo", "fSo");
      pushOr("DeliveryNo", "fDelivery");
      pushOr("Material", "fMaterial");
      pushOr("Currecny", "fCurrency");
      pushOr("VehicleNumber", "fVehicle");

      // Date ranges
      var fBillDate = this._buildDateRangeFilter("BillDate", this.byId("fBillDateDR"));
      if (fBillDate) aFilters.push(fBillDate);

      var fLastDate = this._buildDateRangeFilter("LastDate", this.byId("fLastDateDR"));
      if (fLastDate) aFilters.push(fLastDate);

      // Numeric blocks
      var oVM = this.getView().getModel("view");
      [
        { path: "Quantity", cfg: oVM.getProperty("/qty") },
        { path: "BasicValue", cfg: oVM.getProperty("/basic") },
        { path: "VatValue", cfg: oVM.getProperty("/vat") },
        { path: "TotalInvValue", cfg: oVM.getProperty("/inv") },
        { path: "NoOfPieces", cfg: oVM.getProperty("/pieces") }
      ].forEach(function (b) {
        var f = this._buildNumberFilter(b.path, b.cfg);
        if (f) aFilters.push(f);
      }.bind(this));

      // Apply to binding
      var oBinding = this.byId("salesTable") && this.byId("salesTable").getBinding("items");
      if (oBinding) oBinding.filter(aFilters, "Application");

      this._updateFilterSummaryAndChips();
    },


    onResetFilters: function () {
      // MCBs (Year removed)
      [
        "fQuarter", "fMonth",
        "fBillNo", "fContract", "fSo", "fDelivery",
        "fMaterial", "fCurrency", "fVehicle"
      ].forEach(function (id) {
        var o = this.byId(id);
        o && o.removeAllSelectedItems && o.removeAllSelectedItems();
      }.bind(this));

      // Date pickers (include the NEW Year–Month DatePicker)
      ["fYearMonth"].forEach(function (id) {
        var o = this.byId(id);
        if (o) {
          o.setValue && o.setValue("");
          o.setDateValue && o.setDateValue(null);
        }
      }.bind(this));

      // Date range selectors
      ["fBillDateDR", "fLastDateDR"].forEach(function (id) {
        var o = this.byId(id);
        if (o && o.setDateValue) {
          o.setDateValue(null);
          o.setSecondDateValue(null);
          o.setValue("");
        }
      }.bind(this));

      // Numeric blocks
      var oVM = this.getView().getModel("view");
      ["qty", "basic", "vat", "inv", "pieces"].forEach(function (k) {
        oVM.setProperty("/" + k, { op: "", v1: "", v2: "" });
      });

      // Clear binding filters
      var oBinding = this.byId("salesTable") && this.byId("salesTable").getBinding("items");
      if (oBinding) oBinding.filter([], "Application");

      this._updateFilterSummaryAndChips();
    },

    _wireLiveFilterEvents: function () {
      // MCBs (Year removed)
      [
        "fQuarter", "fMonth",
        "fBillNo", "fContract", "fSo", "fDelivery",
        "fMaterial", "fCurrency", "fVehicle"
      ].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachSelectionFinish && o.attachSelectionFinish(this._onAnyFilterChange, this);
      }.bind(this));

      // Numeric operator Selects
      ["fQtyOp", "fBasicOp", "fVatOp", "fInvOp", "fPiecesOp"].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachChange && o.attachChange(this._onAnyFilterChange, this);
      }.bind(this));

      // Numeric Inputs
      [
        "fQtyVal1", "fQtyVal2",
        "fBasicVal1", "fBasicVal2",
        "fVatVal1", "fVatVal2",
        "fInvVal1", "fInvVal2",
        "fPiecesVal1", "fPiecesVal2"
      ].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachChange && o.attachChange(this._onAnyFilterChange, this);
      }.bind(this));

      // Date controls: include NEW 'fYearMonth' (DatePicker) + existing ranges
      ["fYearMonth", "fBillDateDR", "fLastDateDR"].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachChange && o.attachChange(this._onAnyFilterChange, this);
      }.bind(this));
    },

    _onAnyFilterChange: function () {
      this.onApplyFilters();
    },

    /* ========================
     * CHIPS (optional summary)
     * ======================== */
    _formatNumberFilter: function (label, cfg) {
      if (!cfg || !cfg.op || cfg.v1 === "" || cfg.v1 === null || cfg.v1 === undefined) return "";
      var map = { EQ: "=", NE: "≠", GT: ">", GE: "≥", LT: "<", LE: "≤" };
      if (cfg.op === "BT") {
        if (cfg.v2 === "" || cfg.v2 === null || cfg.v2 === undefined) return "";
        return label + ": " + cfg.v1 + "–" + cfg.v2;
      }
      return label + ": " + (map[cfg.op] || cfg.op) + " " + cfg.v1;
    },

    _wireLiveFilterEvents: function () {
      // MCBs (Year removed)
      [
        "fQuarter", "fMonth",
        "fBillNo", "fContract", "fSo", "fDelivery",
        "fMaterial", "fCurrency", "fVehicle"
      ].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachSelectionFinish && o.attachSelectionFinish(this._onAnyFilterChange, this);
      }.bind(this));

      // Numeric operator Selects
      ["fQtyOp", "fBasicOp", "fVatOp", "fInvOp", "fPiecesOp"].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachChange && o.attachChange(this._onAnyFilterChange, this);
      }.bind(this));

      // Numeric Inputs
      [
        "fQtyVal1", "fQtyVal2",
        "fBasicVal1", "fBasicVal2",
        "fVatVal1", "fVatVal2",
        "fInvVal1", "fInvVal2",
        "fPiecesVal1", "fPiecesVal2"
      ].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachChange && o.attachChange(this._onAnyFilterChange, this);
      }.bind(this));

      // Date controls: include NEW 'fYearMonth' (DatePicker) + existing ranges
      ["fYearMonth", "fBillDateDR", "fLastDateDR"].forEach(function (id) {
        var o = this.byId(id);
        o && o.attachChange && o.attachChange(this._onAnyFilterChange, this);
      }.bind(this));
    },

    onFilterTokenDelete: function (oEvent) {
      var aCD = oEvent.getParameters().tokens && oEvent.getParameters().tokens[0].getCustomData("token");
      if (!aCD) return;
      var findCD = function (key) {
        var o = aCD.find(function (c) { return c.getKey && c.getKey() === key; });
        return o ? o.getValue() : "";
      };
      var sType = findCD("type");
      var sValue = findCD("value");

      var _removeKeyFromMCB = function (that, sId, sKey) {
        var oMCB = that.byId(sId);
        if (!oMCB || !oMCB.getSelectedKeys) return;
        var aKeys = (oMCB.getSelectedKeys() || []).filter(function (k) { return k !== sKey; });
        oMCB.setSelectedKeys(aKeys);
      };

      switch (sType) {
        // Year removed
        case "Quarter": _removeKeyFromMCB(this, "fQuarter", sValue); break;
        case "Month": _removeKeyFromMCB(this, "fMonth", sValue); break;
        case "Bill No": _removeKeyFromMCB(this, "fBillNo", sValue); break;
        case "Contract No": _removeKeyFromMCB(this, "fContract", sValue); break;
        case "SO No": _removeKeyFromMCB(this, "fSo", sValue); break;
        case "Delivery No": _removeKeyFromMCB(this, "fDelivery", sValue); break;
        case "Material": _removeKeyFromMCB(this, "fMaterial", sValue); break;
        case "Currency": _removeKeyFromMCB(this, "fCurrency", sValue); break;
        case "Vehicle No": _removeKeyFromMCB(this, "fVehicle", sValue); break;

        // NEW: Year–Month delete clears DatePicker
        case "YearMonth":
          var oDP = this.byId("fYearMonth");
          if (oDP) {
            oDP.setValue("");
            oDP.setDateValue(null);
          }
          break;

        case "Quantity": this.getView().getModel("view").setProperty("/qty", { op: "", v1: "", v2: "" }); break;
        case "Basic Value": this.getView().getModel("view").setProperty("/basic", { op: "", v1: "", v2: "" }); break;
        case "VAT Value": this.getView().getModel("view").setProperty("/vat", { op: "", v1: "", v2: "" }); break;
        case "Invoice Value": this.getView().getModel("view").setProperty("/inv", { op: "", v1: "", v2: "" }); break;
        case "Pieces": this.getView().getModel("view").setProperty("/pieces", { op: "", v1: "", v2: "" }); break;
        default:
      }

      this._onAnyFilterChange();
    },

    /* ========================
     * SORTING
     * ======================== */
    onOpenSortDialog: function (oEvent) {
      var that = this;
      if (!this._oSortSheet) {
        this._oSortSheet = new ActionSheet({
          placement: "Bottom",
          buttons: [
            new Button({ text: "Sort All Ascending", icon: "sap-icon://sort-ascending", press: function () { that._applySortAll(false); } }),
            new Button({ text: "Sort All Descending", icon: "sap-icon://sort-descending", press: function () { that._applySortAll(true); } }),
            new Button({ text: "Custom Sort…", icon: "sap-icon://action-settings", press: function () { that._openCustomSort(); } }),
            new Button({ text: "Clear Sort", icon: "sap-icon://reset", type: "Transparent", press: function () { that._clearSort(); } })
          ]
        });
        this.getView().addDependent(this._oSortSheet);
      }
      var oSource = (oEvent && oEvent.getSource) ? oEvent.getSource() : this.byId("btnSort");
      this._oSortSheet.openBy(oSource);
    },

    _applySortAll: function (bDescending) {
      var aFieldsInOrder = [
        "Zyear", "Quarter", "Zmonth",
        "BillNo", "BillDate",
        "ContractNo", "SoNo", "DeliveryNo",
        "Material", "Currecny",
        "Quantity", "BasicValue", "VatValue", "TotalInvValue",
        "NoOfPieces", "VehicleNumber", "LastDate"
      ];
      var aSorters = aFieldsInOrder.map(function (sPath) { return new Sorter(sPath, bDescending); });
      var oBinding = this.byId("salesTable") && this.byId("salesTable").getBinding("items");
      if (oBinding) oBinding.sort(aSorters);
    },

    _openCustomSort: function () {
      var that = this;
      if (!this._oVSD) {
        this._oVSD = new ViewSettingsDialog({
          sortDescending: false,
          confirm: function (oEvent) {
            var oItem = oEvent.getParameter("sortItem");
            var bDesc = oEvent.getParameter("sortDescending");
            if (oItem) that._applySingleSort(oItem.getKey(), bDesc);
          }
        });
        [
          new ViewSettingsItem({ text: "Year", key: "Zyear" }),
          new ViewSettingsItem({ text: "Quarter", key: "Quarter" }),
          new ViewSettingsItem({ text: "Month", key: "Zmonth" }),
          new ViewSettingsItem({ text: "Invoice No", key: "BillNo" }),
          new ViewSettingsItem({ text: "Invoice Date", key: "BillDate" }),
          new ViewSettingsItem({ text: "Contract No", key: "ContractNo" }),
          new ViewSettingsItem({ text: "SO No", key: "SoNo" }),
          new ViewSettingsItem({ text: "Delivery No", key: "DeliveryNo" }),
          new ViewSettingsItem({ text: "Material", key: "Material" }),
          new ViewSettingsItem({ text: "Currency", key: "Currecny" }),
          new ViewSettingsItem({ text: "Quantity", key: "Quantity" }),
          new ViewSettingsItem({ text: "Basic Value", key: "BasicValue" }),
          new ViewSettingsItem({ text: "VAT Value", key: "VatValue" }),
          new ViewSettingsItem({ text: "Total Invoice Value", key: "TotalInvValue" }),
          new ViewSettingsItem({ text: "Pieces", key: "NoOfPieces" }),
          new ViewSettingsItem({ text: "Vehicle No", key: "VehicleNumber" }),
          new ViewSettingsItem({ text: "Last Update", key: "LastDate" })
        ].forEach(function (o) { that._oVSD.addSortItem(o); });
        this.getView().addDependent(this._oVSD);
      }
      this._oVSD.open();
    },

    _applySingleSort: function (sPath, bDescending) {
      var oBinding = this.byId("salesTable") && this.byId("salesTable").getBinding("items");
      if (oBinding) oBinding.sort([new Sorter(sPath, bDescending)]);
    },

    _clearSort: function () {
      var oBinding = this.byId("salesTable") && this.byId("salesTable").getBinding("items");
      if (oBinding) oBinding.sort([]);
    },

    /* ---------- UI format helpers for shorthand numbers ---------- */
    formatShortNumber: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      return this._toShort(n, 2); // e.g., 286223.6 -> 286.22K
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

    /* ---------- Currency helpers (value + code) ---------- */
    formatShortCurrencyWithCode: function (v, code) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      var short = this._toShort(n, 2);
      return code ? (short + " " + String(code)) : short;
    },

    formatFullCurrencyWithCode: function (v, code) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      var oFmt = NumberFormat.getFloatInstance({
        maxFractionDigits: 2,
        minFractionDigits: 2,
        groupingEnabled: true
      });
      var full = oFmt.format(n);
      return code ? (full + " " + String(code)) : full;
    },

    /* ---------- Core K/M/B/T converter ---------- */
    _toShort: function (n, decimals) {
      var abs = Math.abs(n);
      var sign = n < 0 ? "-" : "";
      var d = (typeof decimals === "number") ? decimals : 2;

      function fmt(x) {
        var s = x.toFixed(d);
        // trim trailing zeros and dot
        s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
        return s;
      }

      if (abs >= 1e12) return sign + fmt(abs / 1e12) + "T";
      if (abs >= 1e9) return sign + fmt(abs / 1e9) + "B";
      if (abs >= 1e6) return sign + fmt(abs / 1e6) + "M";
      if (abs >= 1e3) return sign + fmt(abs / 1e3) + "K";

      // small numbers: group + up to d decimals
      var oFmt = NumberFormat.getFloatInstance({
        maxFractionDigits: d,
        minFractionDigits: 0,
        groupingEnabled: true
      });
      return sign + oFmt.format(abs);
    },

  });
});
