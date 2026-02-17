sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/Spreadsheet",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/Fragment",
  "sap/viz/ui5/controls/common/feeds/FeedItem",
  "sap/viz/ui5/format/ChartFormatter",
  "sap/viz/ui5/api/env/Format",
  "sap/ui/core/format/NumberFormat"

], function (BaseController, JSONModel, Spreadsheet, MessageToast, MessageBox,
  Filter, FilterOperator, Fragment, FeedItem, ChartFormatter, Format, NumberFormat
) {
  "use strict";

  return BaseController.extend("zsd_sales_ovw.controller.Historical", {
    onInit: function () {

      var that = this;
      var oDSC = this.byId("histDSC");
      oDSC.setShowSideContent(false);

      // Enable short numeric patterns for Viz charts globally on this view
      try {
        Format.numericFormatter(ChartFormatter.getInstance());
        this._SHORT = ChartFormatter.DefaultPattern.SHORTFLOAT;        // 35.6B
        this._SHORT2 = ChartFormatter.DefaultPattern.SHORTFLOAT_MFD2;   // 35.58B
      } catch (e) {
        // Patterns not available on some older runtimes; charts will still work
        this._SHORT = this._SHORT2 = null;
      }

      this.oGlobalModel = this.getOwnerComponent().getModel("oGlobalModel");
      if (!this.oGlobalModel) {
        this.oGlobalModel = new JSONModel({});
        this.getOwnerComponent().setModel(this.oGlobalModel, "oGlobalModel");
      }

      // View model for numeric filters + chips for Tokenizers
      var oViewModel = new JSONModel({
        qty: { op: "", v1: "", v2: "" },
        usd: { op: "", v1: "", v2: "" },
        filterChips: [],
        filterChipsTop: [],
        filterChipsBottom: []
      });
      this.getView().setModel(oViewModel, "view");

      // Flags
      this.oGlobalModel.setProperty("/CompanyQuantity", false);
      this.oGlobalModel = this.getOwnerComponent().getModel("oGlobalModel");
      this.zsd_sales_ovwModel = this.getOwnerComponent().getModel("zsd_sales_ovwModel");
      //this.salesTable = this.getView().byId('salesTable');
      //this.salesTable.setBusy(true)

      var aFilters = [];
      var LastYear = new Date().getFullYear() - 1;   // e.g., 2026
      var aYears = [LastYear, LastYear - 1];    // [2026, 2025]

      // Build OR filter for Year
      var aFilters = [];
      aFilters.push(new sap.ui.model.Filter({
        and: false, // OR
        filters: aYears.map(function (y) {
          return new sap.ui.model.Filter("Year", sap.ui.model.FilterOperator.EQ, y);
        })
      }));
      that.byId("historicalPage").setBusy(true);
      this.zsd_sales_ovwModel.read("/HistoricalOverviewSet", {
        filters: aFilters,
        success: function (oData) {
          delete oData.__metadata;
          var aSalesData = oData.results || [];
          that.oGlobalModel.setProperty("/SalesDataHis", aSalesData);
          that.oGlobalModel.refresh(true);
          that.oGlobalModel.refresh(true);
          that._buildHierDataFromFlat();
          that._buildValueHelps();
          that._applyHistoricalFilters();
          that._updateFilterChips();
          that.byId("historicalPage").setBusy(false);

        },
        error: function () {
          MessageBox.error("Failed to load data.");
        }
      });
    },
    _buildHierDataFromFlat: function () {
      const oGlobal = this.getView().getModel("global");
      const records = this.oGlobalModel.getProperty("/SalesDataHis");
      // Defensive: normalize Number fields when building
      const toNum = (v) => {
        const n = Number(v);
        return isNaN(n) ? 0 : n;
      };

      // Maps for grouping and totals
      const yearMap = new Map();      // key: "2025" -> { year: 2025, rows: [...] }
      const rowMap = new Map();      // key: "2025||Jan-2025" -> month row object
      const totals = new Map();      // key: "2025||Jan-2025" -> { qtySum, usdSum }

      // 1) Iterate every breakdown record
      records.forEach(r => {
        // Normalize keys
        const yStr = r.Year != null ? String(r.Year).trim() : "";
        const monthLabel = r.Month != null ? String(r.Month).trim() : "";
        if (!yStr || !monthLabel) return;

        const ymKey = `${yStr}||${monthLabel}`;
        const qty = toNum(r.Quantity);
        const usd = toNum(r.Usd);

        // Ensure year bucket
        if (!yearMap.has(yStr)) {
          yearMap.set(yStr, { year: Number(yStr), rows: [] });
        }

        // Ensure one row object per (Year, Month)
        if (!rowMap.has(ymKey)) {
          rowMap.set(ymKey, {
            quarter: r.Quater,       // NOTE: SEGW property is 'Quater'
            month: monthLabel,
            quantity: 0,             // filled from totals later
            usd: 0,                  // filled from totals later
            expanded: false,
            breakdownTable: []
          });
        }

        // Push this record into the breakdownTable
        rowMap.get(ymKey).breakdownTable.push({
          sourceMill: r.SourceMill || "",
          productCategory: r.ProductCategory || "",
          TypeOfSales: r.TypeOfSales || "",
          quantity: qty,
          usd: usd
        });

        // Track totals for this month
        if (!totals.has(ymKey)) totals.set(ymKey, { qtySum: 0, usdSum: 0 });
        const t = totals.get(ymKey);
        t.qtySum += qty;
        t.usdSum += usd;
      });

      // 2) Attach totals and rows to their years
      rowMap.forEach((rowObj, ymKey) => {
        const yStr = ymKey.split("||")[0]; // string year
        const t = totals.get(ymKey) || { qtySum: 0, usdSum: 0 };
        rowObj.quantity = t.qtySum;
        rowObj.usd = t.usdSum;

        // Ensure the year bucket exists (safety)
        if (!yearMap.has(yStr)) {
          yearMap.set(yStr, { year: Number(yStr), rows: [] });
        }
        yearMap.get(yStr).rows.push(rowObj);
      });

      // 3) Sort rows inside each year (chronologically by Month label "Mon-YYYY")
      const monthIndex = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const parseMonthLabel = (label) => {
        if (!label) return 0;
        const [mon, yStr] = String(label).split("-");
        const mi = monthIndex[(mon || "").trim()] ?? 0;
        const yy = Number((yStr || "").trim()) || 0;
        return new Date(yy, mi, 1).getTime();
      };
      yearMap.forEach(yBucket => {
        yBucket.rows.sort((a, b) => parseMonthLabel(a.month) - parseMonthLabel(b.month));
      });

      // 4) Final nested object
      const HisData = {
        years: Array.from(yearMap.values()).sort((a, b) => b.year - a.year)
      };

      // Write to model
      this.oGlobalModel.setProperty("/HisDataFiltered", HisData);
      this.oGlobalModel.setProperty("/HisData", HisData);
      this.oGlobalModel.refresh(true);
    },

    onExpandRow: function (oEvent) {
      const oItem = oEvent.getSource();
      const oCtx = oItem.getBindingContext("oGlobalModel");
      const bCurrent = oCtx.getProperty("expanded");

      // Toggle expand
      oCtx.getModel().setProperty(oCtx.getPath() + "/expanded", !bCurrent);
    },
    // ===================== Value Helps =====================
    _buildValueHelps: function () {
      var aYears = this.oGlobalModel.getProperty("/HisDataFiltered/years") || [];
      var aYearVals = [];
      var aQuarterVals = [];
      var aMonthVals = [];

      aYears.forEach(function (y) {
        if (y && y.year != null) aYearVals.push(String(y.year));
        (y.rows || []).forEach(function (r) {
          if (r && r.quarter) aQuarterVals.push(String(r.quarter));
          if (r && r.month) aMonthVals.push(String(r.month));
        });
      });

      function uniqSorted(a) { return Array.from(new Set(a)).sort(); }
      aYearVals.push("2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015",)
      this.oGlobalModel.setProperty("/YearListHis", uniqSorted(aYearVals).map(function (v) { return { key: v, text: v }; }));
      this.oGlobalModel.setProperty("/QuarterListHis", uniqSorted(aQuarterVals).map(function (v) { return { key: v, text: v }; }));
      this.oGlobalModel.setProperty("/MonthListHis", uniqSorted(aMonthVals).map(function (v) { return { key: v, text: v }; }));
      this.oGlobalModel.refresh(true)
    },

    // ===================== Filter Logic =====================
    onAnyFilterChange: function () {
      this._applyHistoricalFilters();
      this._updateFilterChips();
    },

    onApplyFilters: function () {
      this._applyHistoricalFilters();
      this._updateFilterChips();
      MessageToast.show("Filters applied");
    },
    onFetchData: function () {
      var that = this;
      var aSelYears = this.byId("fYearHis").getSelectedKeys();
      var aFilters = [];

      this.byId("historicalPage").setBusy(true);

      // If there are years selected, push a single OR filter: (Year eq y1 or Year eq y2 ...)
      if (Array.isArray(aSelYears) && aSelYears.length > 0) {
        aFilters.push(new sap.ui.model.Filter({
          and: false, // OR
          filters: aSelYears.map(function (y) {
            return new sap.ui.model.Filter("Year", sap.ui.model.FilterOperator.EQ, y);
          })
        }));
      } else {

        var LastYear = new Date().getFullYear() - 1;   // e.g., 2026
        var aYears = [LastYear, LastYear - 1];    // [2026, 2025]

        // Build OR filter for Year
        var aFilters = [];
        aFilters.push(new sap.ui.model.Filter({
          and: false, // OR
          filters: aYears.map(function (y) {
            return new sap.ui.model.Filter("Year", sap.ui.model.FilterOperator.EQ, y);
          })
        }));

      }
      this.zsd_sales_ovwModel.read("/HistoricalOverviewSet", {
        filters: aFilters,
        success: function (oData) {
          delete oData.__metadata;
          var aSalesData = oData.results || [];
          that.oGlobalModel.setProperty("/SalesDataHis", aSalesData);
          // that.oGlobalModel.setProperty("/YearList", []);
          // that.oGlobalModel.setProperty("/QuarterList", []);
          // that.oGlobalModel.setProperty("/MonthList", []);
          // that.oGlobalModel.setProperty("/SourceMillList", []);
          // that.oGlobalModel.setProperty("/TypeOfSalesList", []);
          // that.oGlobalModel.setProperty("/ProductCategoryList", []);
          that.oGlobalModel.refresh(true);
          // that.salesTable.setBusy(false)
          // that._refreshValueHelps();
          that.oGlobalModel.refresh(true);
          that._buildHierDataFromFlat();

          that._buildValueHelps();
          that._applyHistoricalFilters();

          // Build initial chips
          that._updateFilterChips();
          that.byId("historicalPage").setBusy(false);

          // Initial chips
          //that._updateFilterSummaryAndChips();
        },
        error: function () {
          that.byId("historicalPage").setBusy(false);

          MessageBox.error("Failed to load data.");
        }
      });


    },
    onResetFilters: function () {
      ["fYearHis", "fQuarterHis", "fMonthHis"].forEach(function (sId) {
        var oMCB = this.byId(sId);
        if (oMCB && oMCB.removeAllSelectedItems) {
          oMCB.removeAllSelectedItems();
        }
      }, this);

      var oVM = this.getView().getModel("view");
      oVM.setProperty("/qty", { op: "", v1: "", v2: "" });
      oVM.setProperty("/usd", { op: "", v1: "", v2: "" });

      this._applyHistoricalFilters();
      this._updateFilterChips();
    },

    _applyHistoricalFilters: function () {
      var oGM = this.oGlobalModel;
      var HisData = oGM.getProperty("/HisData")

      var aYears = HisData.years

      var aSelYears = this.byId("fYearHis").getSelectedKeys();
      var aSelQuarters = this.byId("fQuarterHis").getSelectedKeys();
      var aSelMonths = this.byId("fMonthHis").getSelectedKeys();

      var oVM = this.getView().getModel("view");
      var qty = oVM.getProperty("/qty");
      var usd = oVM.getProperty("/usd");

      function numberPass(op, v1, v2, val) {
        if (!op || v1 === "" || v1 === null || v1 === undefined) return true;
        var n = Number(val), n1 = Number(v1);
        if (Number.isNaN(n) || Number.isNaN(n1)) return true;
        switch (op) {
          case "EQ": return n === n1;
          case "NE": return n !== n1;
          case "GT": return n > n1;
          case "GE": return n >= n1;
          case "LT": return n < n1;
          case "LE": return n <= n1;
          case "BT":
            if (v2 === "" || v2 === null || v2 === undefined) return true;
            var n2 = Number(v2);
            if (Number.isNaN(n2)) return true;
            var low = Math.min(n1, n2), high = Math.max(n1, n2);
            return n >= low && n <= high;
          default: return true;
        }
      }
      function textIn(sel, v) { return !sel || sel.length === 0 || sel.indexOf(String(v)) > -1; }

      var aFilteredYears = [];
      aYears.forEach(function (y) {
        if (!textIn(aSelYears, y.year)) return;
        var aRows = (y.rows || []).filter(function (r) {
          if (!textIn(aSelQuarters, r.quarter)) return false;
          if (!textIn(aSelMonths, r.month)) return false;
          if (!numberPass(qty.op, qty.v1, qty.v2, r.quantity)) return false;
          if (!numberPass(usd.op, usd.v1, usd.v2, r.usd)) return false;
          return true;
        });
        if (aRows.length > 0) aFilteredYears.push({ year: y.year, rows: aRows });
      });

      // No filters -> use full data
      if (!aSelYears.length && !aSelQuarters.length && !aSelMonths.length &&
        (!qty.op || qty.v1 === "") && (!usd.op || usd.v1 === "")) {
        aFilteredYears = aYears;
      }



      oGM.setProperty("/HisDataFiltered", { years: aFilteredYears });
      oGM.refresh(true);
      var DataAvailable = true;
      if (aSelYears.length > 0) {

        const filteredYearsSet = new Set(aFilteredYears.map(x => String(x.year)));
        const DataAvailable = aSelYears.every(y => filteredYearsSet.has(String(y)));

        if (DataAvailable == false) {
          this.onFetchData();
        }
      }
    },

    // ===================== Chips (Tokenizer) =====================
    _updateFilterChips: function () {
      var oVM = this.getView().getModel("view");
      var aChips = [];

      var _addKeyChips = function (label, oMCB) {
        if (!oMCB) return;
        (oMCB.getSelectedItems() || []).forEach(function (oItem) {
          aChips.push({
            key: label + ":" + oItem.getKey(),
            text: label + ": " + oItem.getText(),
            type: label,
            value: oItem.getKey()
          });
        });
      };

      _addKeyChips("Year", this.byId("fYearHis"));
      _addKeyChips("Quarter", this.byId("fQuarterHis"));
      _addKeyChips("Month", this.byId("fMonthHis"));

      var sQty = this._formatNumberFilter("Quantity", oVM.getProperty("/qty"));
      if (sQty) aChips.push({ key: "Quantity", text: sQty, type: "Quantity", value: "" });

      var sUsd = this._formatNumberFilter("USD", oVM.getProperty("/usd"));
      if (sUsd) aChips.push({ key: "USD", text: sUsd, type: "USD", value: "" });

      // Split across two rows (adjust MAX_TOP_TOKENS as needed)
      var MAX_TOP_TOKENS = 6;
      oVM.setProperty("/filterChips", aChips);
      oVM.setProperty("/filterChipsTop", aChips.slice(0, MAX_TOP_TOKENS));
      oVM.setProperty("/filterChipsBottom", aChips.slice(MAX_TOP_TOKENS));
    },

    _formatNumberFilter: function (label, cfg) {
      if (!cfg || !cfg.op || cfg.v1 === "" || cfg.v1 === null || cfg.v1 === undefined) return "";
      var map = { EQ: "=", NE: "≠", GT: ">", GE: "≥", LT: "<", LE: "≤" };
      if (cfg.op === "BT") {
        if (cfg.v2 === "" || cfg.v2 === null || cfg.v2 === undefined) return "";
        return label + ": " + cfg.v1 + "–" + cfg.v2;
      }
      return label + ": " + (map[cfg.op] || cfg.op) + " " + cfg.v1;
    },

    onFilterTokenDeleteHist: function (oEvent) {
      var aCD = oEvent.mParameters.tokens[0].getCustomData('token')

      function _getCD(key) {
        var o = aCD.find(function (c) { return c.getKey && c.getKey() === key; });
        return o ? o.getValue() : "";
      }

      var sType = _getCD("type");   // Year | Quarter | Month | Quantity | USD
      var sValue = _getCD("value");

      var _removeKeyFromMCB = function (that, sId, sKey) {
        var oMCB = that.byId(sId);
        if (!oMCB) return;
        var aKeys = (oMCB.getSelectedKeys() || []).filter(function (k) { return k !== sKey; });
        oMCB.setSelectedKeys(aKeys);
      };

      switch (sType) {
        case "Year": _removeKeyFromMCB(this, "fYearHis", sValue); break;
        case "Quarter": _removeKeyFromMCB(this, "fQuarterHis", sValue); break;
        case "Month": _removeKeyFromMCB(this, "fMonthHis", sValue); break;
        case "Quantity":
          this.getView().getModel("view").setProperty("/qty", { op: "", v1: "", v2: "" });
          break;
        case "USD":
          this.getView().getModel("view").setProperty("/usd", { op: "", v1: "", v2: "" });
          break;
        default: /* no-op */ break;
      }

      // Re-apply and rebuild chips
      this._applyHistoricalFilters();
      this._updateFilterChips();
    },

    // ===================== Side/Main toggle =====================
    onToggleSideContent: function () {
      var oDSC = this.byId("histDSC");
      var bShow = oDSC.getShowSideContent();
      this.byId("btnToggleMainHis").setVisible(true);
      oDSC.setShowSideContent(!bShow);
    },

    onToggleMainContent: function () {
      var oDSC = this.byId("histDSC");
      var bShow = oDSC.getShowSideContent();
      oDSC.setShowSideContent(!bShow);
      this.byId("btnToggleMainHis").setVisible(false);
    },

    // ===================== Company-wise toggles =====================
    onCompanyQuantity: function () {
      this.oGlobalModel.setProperty("/CompanyQuantity", true);
      this.oGlobalModel.refresh(true);
    },

    onCompanyValue: function () {
      MessageToast.show("Company-wise Value view not implemented yet");
    },

    // ===================== Export current filtered view =====================
    onExportExcel: function () {
      try {
        var oGM = this.oGlobalModel;
        var aYears = (oGM.getProperty("/HisDataFiltered/years") || []);
        var aData = [];
        aYears.forEach(function (y) {
          (y.rows || []).forEach(function (r) {
            r.breakdownTable.forEach(function (BreakdownTable) {
              aData.push({
                Year: y.year,
                Quarter: r.quarter,
                Month: r.month,
                Product: BreakdownTable.productCategory,
                TypeOfSales: BreakdownTable.TypeOfSales,
                SourceMill: BreakdownTable.sourceMill,
                Quantity: BreakdownTable.quantity,
                USD: BreakdownTable.usd
              });
            })
          });
        });

        if (!aData.length) {
          MessageToast.show("No data to export");
          return;
        }

        var oSheet = new Spreadsheet({
          workbook: {
            columns: [
              { label: "Year", property: "Year", type: "number" },
              { label: "Quarter", property: "Quarter", type: "string" },
              { label: "Month", property: "Month", type: "string" },
              { label: "SourceMill", property: "SourceMill", type: "string" },
              { label: "Product", property: "Product", type: "string" },
              { label: "TypeOfSales", property: "TypeOfSales", type: "string" },
              { label: "Quantity", property: "Quantity", type: "number" },
              { label: "USD", property: "USD", type: "number" }
            ],

            context: {
              sheetName: "Historical Overview"
            }
          },
          dataSource: aData,
          fileName: "Sales_Overview.xlsx"
        });
        oSheet.build().then(function () { oSheet.destroy(); });

      } catch (e) {
        MessageBox.error("Export failed: " + e);
      }
    },

    /* ============================
     * CHART DIALOG (no filters here)
     * ============================ */
    onOpenChartDialog: function () {
      if (!this._pChartDialog) {
        this._pChartDialog = this._createChartDialog();
      }
      this._pChartDialog.then(function (oDialog) { oDialog.open(); });
    },

    // === Helper: Flatten /HisDataFiltered (respects all on-screen filters) ===
    _getFilteredBreakdownFlat: function () {
      var aYears = this.oGlobalModel.getProperty("/HisDataFiltered/years") || [];
      var aFlat = [];
      aYears.forEach(function (y) {
        (y.rows || []).forEach(function (r) {
          (r.breakdownTable || []).forEach(function (b) {
            aFlat.push({
              Year: y.year,
              Quarter: r.quarter || "",
              Month: r.month || "",
              SourceMill: b.sourceMill || "",
              ProductCategory: b.productCategory || "",
              TypeOfSales: b.TypeOfSales || "",
              Quantity: Number(b.quantity || 0),
              USDValue: Number(b.usd || b.USD || b.Usd || 0)
            });
          });
        });
      });
      return aFlat;
    },

    // When user toggles "Compare across Years"
    onCompareAcrossYearsToggle: function (oEvent) {
      var bState = !!oEvent.getParameter("state");
      this.getView().getModel("chartMetaHis").setProperty("/CompareAcrossYears", bState);
      // Clear YearForPeriod when switching to compare mode (optional)
      if (bState) {
        this.getView().getModel("chartMetaHis").setProperty("/YearForPeriod", "");
      }
      this._rebuildChart();
    },

    // When user changes the years to compare (MultiComboBox)
    onCompareYearsChange: function (oEvent) {
      var aKeys = oEvent.getSource().getSelectedKeys() || [];
      this.getView().getModel("chartMetaHis").setProperty("/CompareYearKeys", aKeys);
      this._rebuildChart();
    },


    _createChartDialog: function () {
      var oView = this.getView();
      var that = this;

      // Prepare models on first open
      var ochartMetaHis = new JSONModel({
        ChartType: "column",           // column | bar | line | pie | donut | dual_column
        Measure: "Quantity",           // Quantity | USD Value
        DimensionKey: "",              // Month | Quarter | SourceMill | ProductCategory | ...
        Dimensions: [],                // [{key,text}]
        YearForPeriod: "",             // (only when not comparing and dimension is Month/Quarter)
        YearOptions: [],               // built from filtered data

        // NEW: Compare across years
        CompareAcrossYears: true,      // default ON
        CompareYearsList: [],          // [{key,text}]
        CompareYearKeys: []            // ['2025','2024',...]
      });
      oView.setModel(ochartMetaHis, "chartMetaHis");

      var oChartModel = new JSONModel({ ChartData: [] });
      oView.setModel(oChartModel, "chartModelHis");


      return Fragment.load({
        id: oView.getId(),
        name: "zsd_sales_ovw.fragment.HistoricalChart",
        controller: this
      }).then(function (oDialog) {
        oView.addDependent(oDialog);
        oDialog.attachAfterOpen(that._onChartDialogAfterOpen.bind(that));
        return oDialog;
      });
    },


    _onChartDialogAfterOpen: function () {
      var oView = this.getView();

      // Connect popover ↔ vizframe
      var oPopover = oView.byId("vfPopoverHis");
      var oVizFrame = oView.byId("vfSalesHis");
      if (oPopover && oVizFrame) {
        oPopover.connect(oVizFrame.getVizUid());
      }

      // Build dimension list from current data
      this._refreshChartDimensions();

      // Build Year options from filtered flat data (honors on-screen filters)
      var aFlat = this._getFilteredBreakdownFlat();
      var aYears = Array.from(new Set(
        aFlat.map(function (r) { return r.Year; })
          .filter(function (y) { return y !== "" && y !== null && y !== undefined; })
      )).sort(function (a, b) { return String(a).localeCompare(String(b)); });

      var aYearOpts = aYears.map(function (y) { return { key: String(y), text: String(y) }; });

      // Default selected compare years = whatever user picked in Year filter
      var aSelYears = this.byId("fYearHis")?.getSelectedKeys() || [];
      if (!aSelYears.length && aYears.length > 0) {
        var last2 = aYears.slice(-2);
        aSelYears = last2.map(function (y) { return String(y); });
      }

      var oMeta = oView.getModel("chartMetaHis");
      oMeta.setProperty("/YearOptions", aYearOpts);
      oMeta.setProperty("/CompareYearsList", aYearOpts);
      oMeta.setProperty("/CompareYearKeys", aSelYears);

      // Build once
      this._rebuildChart();
    },

    onChartDialogCancel: function () {
      var oDlg = this.getView().byId("chartOptionsDialogHis");
      oDlg && oDlg.close();
    },

    onChartDialogAfterClose: function () {
      // keep instance; nothing special
    },

    onChartTypeChange: function (oEvent) {
      var sKey = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("chartMetaHis").setProperty("/ChartType", sKey);
      // if dual, force both measures (UI disables measure picker already)
      this._rebuildChart();
    },

    onMeasureChange: function (oEvent) {
      var sKey = oEvent.getParameter("item").getKey(); // SegmentedButton
      this.getView().getModel("chartMetaHis").setProperty("/Measure", sKey);
      this._rebuildChart();
    },

    onDimensionChange: function (oEvent) {
      var sKey = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("chartMetaHis").setProperty("/DimensionKey", sKey);
      this._rebuildChart();
    },

    /* Build list of possible dimensions (non-measure columns) */
    _refreshChartDimensions: function () {
      var oVM = this.getView().getModel("chartMetaHis");
      var aData = this._getCurrentTableData();
      var aDims = this._deriveDimensionsFromData(aData);

      // pick first as default if not set
      var sCurrent = oVM.getProperty("/DimensionKey");
      if (!sCurrent && aDims.length) {
        sCurrent = aDims[0].key;
      }

      oVM.setProperty("/Dimensions", aDims);
      oVM.setProperty("/DimensionKey", sCurrent);
    },

    _getCurrentTableData: function () {
      // Use currently visible rows of the table (honors existing filters/sorts).
      // var oTable = this.byId("salesTable");
      // var oBinding = oTable && oTable.getBinding("items");
      // if (oBinding) {
      //   var aCtx = oBinding.getCurrentContexts();
      //   if (aCtx && aCtx.length) {
      //     try {
      //       return aCtx.map(function (c) { return c.getObject(); });
      //     } catch (e) {
      //       // fall through
      //     }
      //   }
      // }
      // Fallback: full model data
      var aAll = this.oGlobalModel.getProperty("/SalesDataHis") || [];
      return aAll;
    },

    _deriveDimensionsFromData: function (aData) {
      if (!aData || !aData.length) return [];

      // Known measure property names to EXCLUDE as dimensions
      var aMeasureKeys = ["Quantity", "Usd", "USD", "USDValue", "USDInvoiceValue"];

      // Pretty labels for known fields
      var mNice = {
        "Year": "Year",
        "Quater": "Quarter",
        "Quarter": "Quarter",
        "Month": "Month",
        "SourceMill": "Source Mill",
        "TypeOfSales": "Sales Type",
        "ProductCategory": "Product Category"
      };

      // Consider keys that exist in data and are NOT measures.
      // Prefer string-like or small-domain numerics (Year).
      var oSample = aData[0] || {};
      var aKeys = Object.keys(oSample).filter(function (k) {
        return aMeasureKeys.indexOf(k) === -1;
      });
      aKeys.splice(0, 1)
      // Optional: sense if key is usable by sampling a few rows
      function isUsableDim(key) {
        var count = 0, distinct = new Set();
        for (var i = 0; i < Math.min(aData.length, 50); i++) {
          var v = aData[i][key];
          if (v !== null && v !== undefined && v !== "") {
            distinct.add(String(v));
            count++;
          }
        }
        // If almost no values, skip; otherwise OK
        return count > 0 && distinct.size > 0;
      }

      var aDims = aKeys
        .filter(isUsableDim)
        .map(function (k) {
          return { key: k, text: mNice[k] || k.replace(/([A-Z])/g, " $1").trim() };
        });

      // Sort by nice text
      aDims.sort(function (a, b) { return a.text.localeCompare(b.text); });

      return aDims;
    },


    _getVizTypeForKey: function (sKey) {
      switch (sKey) {
        case "column": return "column";
        case "bar": return "bar";
        case "line": return "line";
        case "pie": return "pie";
        case "donut": return "donut";
        case "dual_column":
          return "dual_column"; // if your runtime complains, change to "dual_combination"
        default: return "column";
      }
    },



    _rebuildChart: function () {
      var oView = this.getView();
      var oViz = oView.byId("vfSalesHis");
      if (!oViz) return;

      var oMeta = oView.getModel("chartMetaHis").getData();
      var sDimKey = oMeta.DimensionKey;
      var bCompare = !!oMeta.CompareAcrossYears;

      // Flattened, filtered rows (respects on-screen filters)
      var aFlat = this._getFilteredBreakdownFlat();

      if (!sDimKey) {
        oView.getModel("chartModelHis").setProperty("/ChartData", []);
        try { oViz.setVizProperties({ title: { visible: true, text: "No dimension selected" } }); } catch (e) { }
        return;
      }

      // Normalize Quarter key
      var sQuarterKey = "Quarter";
      if (aFlat.length && !("Quarter" in aFlat[0]) && ("Quater" in aFlat[0])) {
        sQuarterKey = "Quater";
      }

      function getCategory(r) {
        if (sDimKey === "Quarter" || sDimKey === "Quater") return String(r[sQuarterKey] || "");
        return String(r[sDimKey] || "");
      }

      // Compare mode: filter by selected years
      var aCompareYears = (oMeta.CompareYearKeys || []).map(String);
      if (bCompare && aCompareYears.length) {
        aFlat = aFlat.filter(function (r) { return aCompareYears.indexOf(String(r.Year)) > -1; });
      }

      // Non-compare: if dimension is period and YearForPeriod set, restrict
      var bPeriodDim = (sDimKey === "Month" || sDimKey === "Quarter" || sDimKey === "Quater");
      if (!bCompare && bPeriodDim && oMeta.YearForPeriod) {
        aFlat = aFlat.filter(function (r) { return String(r.Year) === String(oMeta.YearForPeriod); });
      }

      // Aggregate
      var mAgg = Object.create(null);
      aFlat.forEach(function (r) {
        var cat = getCategory(r);
        if (!cat) return;

        var qty = Number(r.Quantity || 0);
        var usd = Number(r.USDValue || 0);
        if (!isFinite(qty)) qty = 0;
        if (!isFinite(usd)) usd = 0;

        if (bCompare) {
          var yr = String(r.Year || "");
          if (!yr) return;
          var key = cat + "||" + yr;
          if (!mAgg[key]) mAgg[key] = { Category: cat, Year: yr, Quantity: 0, USDValue: 0 };
          mAgg[key].Quantity += qty;
          mAgg[key].USDValue += usd;
        } else {
          if (!mAgg[cat]) mAgg[cat] = { Category: cat, Quantity: 0, USDValue: 0 };
          mAgg[cat].Quantity += qty;
          mAgg[cat].USDValue += usd;
        }
      });

      var aAgg = Object.keys(mAgg).map(function (k) { return mAgg[k]; });

      // Sort (Month has custom order)
      if (sDimKey === "Month" && aAgg.length) {
        var monthIndex = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        var getMonIdx = function (label) {
          var mon = String(label).split("-")[0].trim();
          return (monthIndex[mon] != null) ? monthIndex[mon] : 99;
        };
        aAgg.sort(function (a, b) {
          var d = getMonIdx(a.Category) - getMonIdx(b.Category);
          if (d !== 0) return d;
          return String(a.Year || "").localeCompare(String(b.Year || ""));
        });
      } else {
        aAgg.sort(function (a, b) {
          var c = String(a.Category).localeCompare(String(b.Category));
          if (c !== 0) return c;
          return String(a.Year || "").localeCompare(String(b.Year || ""));
        });
      }

      // Bind data
      oView.getModel("chartModelHis").setProperty("/ChartData", aAgg);

      // Choose viz type safely (force column for compare dual)
      var sVizKey = oMeta.ChartType || "column";
      if (bCompare && sVizKey === "dual_column") sVizKey = "column";
      var sVizType = this._getVizTypeForKey(sVizKey);
      try { oViz.setVizType(sVizType); } catch (e) {
        try { oViz.setVizType("column"); } catch (e2) { }
      }

      // Titles
      var sMeasureLabel = (sVizKey === "dual_column") ? "Quantity & USD Value"
        : (oMeta.Measure === "USD Value" ? "USD Value" : "Quantity");
      var sPrettyDim = (function (k) {
        var map = {
          "Year": "Year",
          "Quater": "Quarter",
          "Quarter": "Quarter",
          "Month": "Month",
          "SourceMill": "Source Mill",
          "TypeOfSales": "Sales Type",
          "ProductCategory": "Product Category"
        };
        return map[k] || String(k).replace(/([A-Z])/g, " $1").trim();
      })(sDimKey);

      var sTitle;
      if (bCompare) {
        sTitle = sPrettyDim + " vs " + sMeasureLabel + " (by Year)";
      } else if (bPeriodDim) {
        sTitle = sPrettyDim + " vs " + sMeasureLabel + " " +
          (oMeta.YearForPeriod ? ("(Year: " + oMeta.YearForPeriod + ")") : "(All Years)");
      } else {
        sTitle = sPrettyDim + " vs " + sMeasureLabel;
      }

      // Short number patterns if available
      var sShort = this._SHORT || null;
      var sShort2 = this._SHORT2 || null;

      var mProps = {
        title: { visible: true, text: sTitle },
        legend: { visible: true },
        plotArea: { dataLabel: { visible: true } },
        interaction: { zoom: true }
      };
      if (sVizType !== "pie" && sVizType !== "donut") {
        mProps.categoryAxis = { title: { visible: true, text: "Dimension: " + sPrettyDim } };
        mProps.valueAxis = { title: { visible: true, text: sMeasureLabel } };
        if (sShort) mProps.valueAxis.label = { formatString: sShort };
        if (sVizType === "dual_column") {
          mProps.valueAxis2 = { title: { visible: true, text: "USD Value" } };
          if (sShort) mProps.valueAxis2.label = { formatString: sShort };
        }
        if (sShort2) mProps.plotArea.dataLabel.formatString = sShort2;
      } else {
        if (sShort2) mProps.plotArea.dataLabel.formatString = sShort2;
      }

      try { oViz.setVizProperties(mProps); } catch (e) { }

      // Feeds
      try { oViz.removeAllFeeds(); } catch (e) { }
      if (bCompare) {
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "categoryAxis", type: "Dimension", values: ["Category"]
        }));
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "color", type: "Dimension", values: ["Year"]
        }));
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "valueAxis", type: "Measure",
          values: [(oMeta.Measure === "USD Value") ? "USD Value" : "Quantity"]
        }));
      } else if (sVizType === "pie" || sVizType === "donut") {
        var sMeasurePie = (oMeta.Measure === "USD Value") ? "USD Value" : "Quantity";
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "size", type: "Measure", values: [sMeasurePie]
        }));
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "color", type: "Dimension", values: ["Category"]
        }));
      } else if (sVizType === "dual_column") {
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "categoryAxis", type: "Dimension", values: ["Category"]
        }));
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "valueAxis", type: "Measure", values: ["Quantity"]
        }));
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "valueAxis2", type: "Measure", values: ["USD Value"]
        }));
      } else {
        var sMeasure = (oMeta.Measure === "USD Value") ? "USD Value" : "Quantity";
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "categoryAxis", type: "Dimension", values: ["Category"]
        }));
        oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
          uid: "valueAxis", type: "Measure", values: [sMeasure]
        }));
      }

      try { oViz.invalidate(); } catch (e) { }
    },
    onYearForPeriodChange: function (oEvent) {
      var oSrc = oEvent.getSource();

      // When user clears the ComboBox, selectedItem is null.
      var sKey = "";
      var oItem = oEvent.getParameter("selectedItem");

      if (oItem) {
        sKey = oItem.getKey();
      } else {
        // fallback to the raw key in the field
        sKey = oSrc.getSelectedKey() || "";
      }

      // Update the chart meta model
      this.getView()
        .getModel("chartMetaHis")
        .setProperty("/YearForPeriod", sKey);

      // Rebuild the chart with month/quarter + year combination
      this._rebuildChart();
    },

    /* ---------- Numeric format helpers for UI texts ---------- */
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
    },
  });
});
