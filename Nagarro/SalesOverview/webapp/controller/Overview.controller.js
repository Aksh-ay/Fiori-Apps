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
  "sap/ui/core/Fragment",
  "sap/viz/ui5/controls/common/feeds/FeedItem",
  "sap/m/MessageToast",
  "sap/viz/ui5/format/ChartFormatter",
  "sap/viz/ui5/api/env/Format",
  "sap/ui/core/format/NumberFormat"

], function (
  BaseController, JSONModel, Spreadsheet, MessageBox,
  ActionSheet, Button, ViewSettingsDialog, ViewSettingsItem,
  Sorter, Filter, FilterOperator, Fragment, FeedItem, MessageToast, ChartFormatter, Format, NumberFormat
) {
  "use strict";

  return BaseController.extend("zsd_sales_ovw.controller.Overview", {
    onInit: function () {
      var that = this;

      // 1) Short numeric formatting for Viz charts
      Format.numericFormatter(ChartFormatter.getInstance());
      this._SHORT = ChartFormatter.DefaultPattern.SHORTFLOAT;        // e.g., 35.6B
      this._SHORT2 = ChartFormatter.DefaultPattern.SHORTFLOAT_MFD2;  // with 2 decimals

      this._syncToggleText();
      var oDSC = this.byId("dsc");
      oDSC.setShowSideContent(false);
      var oViewModel = new JSONModel({
        qty: { op: "", v1: "", v2: "" },
        usd: { op: "", v1: "", v2: "" },
        filterChips: [],
        filterChipsTop: [],
        filterChipsBottom: [],
        filterSummary: ""
      });
      this.getView().setModel(oViewModel, "view");


      this.oGlobalModel = this.getOwnerComponent().getModel("oGlobalModel");
      this.zsd_sales_ovwModel = this.getOwnerComponent().getModel("zsd_sales_ovwModel");
      this.salesTable = this.getView().byId('salesTable');
      this.onCallCurrentYearOverview();
      this._wireLiveFilterEvents();
    },
    onCallCurrentYearOverview: function () {
      var that = this;
      this.salesTable.setBusy(true)
      this.zsd_sales_ovwModel.read("/CurrentYearOverviewSet", {
        success: function (oData) {
          delete oData.__metadata;
          var aSalesData = oData.results || [];
          that.oGlobalModel.setProperty("/SalesData", aSalesData);
          that.oGlobalModel.setProperty("/YearList", []);
          that.oGlobalModel.setProperty("/QuarterList", []);
          that.oGlobalModel.setProperty("/MonthList", []);
          that.oGlobalModel.setProperty("/SourceMillList", []);
          that.oGlobalModel.setProperty("/TypeOfSalesList", []);
          that.oGlobalModel.setProperty("/ProductCategoryList", []);
          that.oGlobalModel.refresh(true);
          that.salesTable.setBusy(false)
          that._refreshValueHelps();
          that.oGlobalModel.refresh(true);
          //  that._buildHierDataFromFlat();


          // Initial chips
          that._updateFilterSummaryAndChips();
        },
        error: function () {
          MessageBox.error("Failed to load data.");
        }
      });
    },
    onSyncOverview: function () {
      this.onCallCurrentYearOverview();
    },
    // Excel
    onExportExcel: function () {
      var oModel = this.getOwnerComponent().getModel("oGlobalModel");
      var aData = oModel.getProperty("/SalesData") || [];
      var aCols = this._createColumnConfig();

      var oSheet = new Spreadsheet({
        workbook: { columns: aCols },
        dataSource: aData,
        fileName: "SalesData.xlsx"
      });

      oSheet.build()
        .then(function () { oSheet.destroy(); })
        .catch(function (err) { MessageBox.error("Export failed: " + err); });
    },

    _createColumnConfig: function () {
      return [
        { label: "Year", property: "Year", type: "number" },
        { label: "Quarter", property: "Quater", type: "string" },
        { label: "Month", property: "Month", type: "string" },
        { label: "Source Mill", property: "SourceMill", type: "string" },
        { label: "Type of Sales", property: "TypeOfSales", type: "string" },
        { label: "Product Category", property: "ProductCategory", type: "string" },
        { label: "Quantity", property: "Quantity", type: "number" },
        { label: "USD Value", property: "Usd", type: "number" }
      ];
    },

    // Filter: show/hide
    onToggleSideContent: function () {
      var oDSC = this.byId("dsc");
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMain");
      oBtnMain.setVisible(true);
      oDSC.setShowSideContent(!bShow);
      this._syncToggleText();
    },

    onToggleMainContent: function () {
      var oDSC = this.byId("dsc");
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMain");
      oDSC.setShowSideContent(!bShow);
      oBtnMain.setVisible(false);
    },

    _syncToggleText: function () {
      var oBtnMain = this.byId("btnToggleMain");
      var oBtnSide = this.byId("btnToggleSide");
    },
    _refreshValueHelps: function () {
      var aData = this.oGlobalModel.getProperty("/SalesData") || [];

      function uniqSorted(mapper) {
        return Array.from(
          new Set(
            aData
              .map(mapper)
              .filter(function (v) { return v !== undefined && v !== null && v !== ""; })
          )
        ).sort();
      }

      var aYear = uniqSorted(function (r) { return r.Year; });
      var aQuarter = uniqSorted(function (r) { return r.Quater; });
      var aMonth = uniqSorted(function (r) { return r.Month; });
      var aMill = uniqSorted(function (r) { return r.SourceMill; });
      var aType = uniqSorted(function (r) { return r.TypeOfSales; });
      var aCat = uniqSorted(function (r) { return r.ProductCategory; });

      this.oGlobalModel.setProperty("/YearList", aYear.map(function (v) { return ({ key: String(v), text: String(v) }); }));
      this.oGlobalModel.setProperty("/QuarterList", aQuarter.map(function (v) { return ({ key: String(v), text: String(v) }); }));
      this.oGlobalModel.setProperty("/MonthList", aMonth.map(function (v) { return ({ key: String(v), text: String(v) }); }));
      this.oGlobalModel.setProperty("/SourceMillList", aMill.map(function (v) { return ({ key: String(v), text: String(v) }); }));
      this.oGlobalModel.setProperty("/TypeOfSalesList", aType.map(function (v) { return ({ key: String(v), text: String(v) }); }));
      this.oGlobalModel.setProperty("/ProductCategoryList", aCat.map(function (v) { return ({ key: String(v), text: String(v) }); }));
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
      if (cfg.v1 === "" || cfg.v1 === null || cfg.v1 === undefined) return null;
      var n1 = Number(cfg.v1);
      if (Number.isNaN(n1)) return null;
      switch (cfg.op) {
        case "EQ": return new Filter(sPath, FilterOperator.EQ, n1);
        case "NE": return new Filter(sPath, FilterOperator.NE, n1);
        case "GT": return new Filter(sPath, FilterOperator.GT, n1);
        case "GE": return new Filter(sPath, FilterOperator.GE, n1);
        case "LT": return new Filter(sPath, FilterOperator.LT, n1);
        case "LE": return new Filter(sPath, FilterOperator.LE, n1);
        case "BT":
          if (cfg.v2 === "" || cfg.v2 === null || cfg.v2 === undefined) return null;
          var n2 = Number(cfg.v2);
          if (Number.isNaN(n2)) return null;
          var low = Math.min(n1, n2);
          var high = Math.max(n1, n2);
          return new Filter(sPath, FilterOperator.BT, low, high);
        default:
          return null;
      }
    },
    onApplyFilters: function () {
      var aFilters = [];
      var aYears = this.byId("fYear").getSelectedKeys();
      var aQuaters = this.byId("fQuarter").getSelectedKeys(); // data path: Quater
      var aMonths = this.byId("fMonth").getSelectedKeys();
      var aSrc = this.byId("fSourceMill").getSelectedKeys();
      var aType = this.byId("fTypeSales").getSelectedKeys();
      var aCat = this.byId("fProdCat").getSelectedKeys();

      var oF;
      if ((oF = this._buildOrFilter("Year", aYears))) aFilters.push(oF);
      if ((oF = this._buildOrFilter("Quater", aQuaters))) aFilters.push(oF);
      if ((oF = this._buildOrFilter("Month", aMonths))) aFilters.push(oF);
      if ((oF = this._buildOrFilter("SourceMill", aSrc))) aFilters.push(oF);
      if ((oF = this._buildOrFilter("TypeOfSales", aType))) aFilters.push(oF);
      if ((oF = this._buildOrFilter("ProductCategory", aCat))) aFilters.push(oF);

      var oVM = this.getView().getModel("view");
      var oQtyCfg = oVM.getProperty("/qty");
      var oUsdCfg = oVM.getProperty("/usd");

      var oQtyFilter = this._buildNumberFilter("Quantity", oQtyCfg);
      if (oQtyFilter) aFilters.push(oQtyFilter);

      var oUsdFilter = this._buildNumberFilter("Usd", oUsdCfg);
      if (oUsdFilter) aFilters.push(oUsdFilter);

      var oBinding = this.byId("salesTable").getBinding("items");
      if (oBinding) {
        oBinding.filter(aFilters, "Application");
      }
      this._updateFilterSummaryAndChips();
    },

    onResetFilters: function () {
      ["fYear", "fQuarter", "fMonth", "fSourceMill", "fTypeSales", "fProdCat"].forEach(function (sId) {
        var oMCB = this.byId(sId);
        if (oMCB && oMCB.removeAllSelectedItems) {
          oMCB.removeAllSelectedItems();
        }
      }, this);

      var oVM = this.getView().getModel("view");
      oVM.setProperty("/qty", { op: "", v1: "", v2: "" });
      oVM.setProperty("/usd", { op: "", v1: "", v2: "" });

      var oBinding = this.byId("salesTable").getBinding("items");
      if (oBinding) {
        oBinding.filter([], "Application");
      }
      this._updateFilterSummaryAndChips();
    },

    refreshValueHelpsFromData: function () {
      this._refreshValueHelps();
    },
    _wireLiveFilterEvents: function () {
      var aMCBIds = ["fYear", "fQuarter", "fMonth", "fSourceMill", "fTypeSales", "fProdCat"];
      aMCBIds.forEach(function (sId) {
        var oMCB = this.byId(sId);
        if (oMCB && oMCB.attachSelectionFinish) {
          oMCB.attachSelectionFinish(this._onAnyFilterChange, this);
        }
      }, this);

      ["fQtyOp", "fUsdOp"].forEach(function (sId) {
        var oSel = this.byId(sId);
        oSel && oSel.attachChange(this._onAnyFilterChange, this);
      }, this);

      ["fQtyVal1", "fQtyVal2", "fUsdVal1", "fUsdVal2"].forEach(function (sId) {
        var oInp = this.byId(sId);
        oInp && oInp.attachChange(this._onAnyFilterChange, this);
      }, this);
    },

    _onAnyFilterChange: function () {
      this.onApplyFilters();
    },


    _updateFilterSummaryAndChips: function () {
      var oVM = this.getView().getModel("view");
      var aChips = [];

      var addKeyChips = function (label, oMCB) {
        if (!oMCB) return;
        var aItems = oMCB.getSelectedItems() || [];
        aItems.forEach(function (oItem) {
          var sText = oItem.getText();
          var sKey = oItem.getKey();
          aChips.push({
            key: label + ":" + sKey,
            text: label + ": " + sText,
            type: label,
            value: sKey
          });
        });
      };
      addKeyChips("Year", this.byId("fYear"));
      addKeyChips("Quarter", this.byId("fQuarter"));
      addKeyChips("Month", this.byId("fMonth"));
      addKeyChips("Source Mill", this.byId("fSourceMill"));
      addKeyChips("Type of Sales", this.byId("fTypeSales"));
      addKeyChips("Product Category", this.byId("fProdCat"));

      var sQty = this._formatNumberFilter("Quantity", oVM.getProperty("/qty"));
      if (sQty) aChips.push({ key: "Quantity", text: sQty, type: "Quantity", value: "" });

      var sUsd = this._formatNumberFilter("USD", oVM.getProperty("/usd"));
      if (sUsd) aChips.push({ key: "USD", text: sUsd, type: "USD", value: "" });
      oVM.setProperty("/filterChips", aChips);
      oVM.setProperty("/filterSummary", aChips.map(function (c) { return c.text; }).join("  •  "));
      var MAX_TOP_TOKENS = 6;
      var aTop = aChips.slice(0, MAX_TOP_TOKENS);
      var aBottom = aChips.slice(MAX_TOP_TOKENS);

      oVM.setProperty("/filterChipsTop", aTop);
      oVM.setProperty("/filterChipsBottom", aBottom);
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

    onFilterTokenDelete: function (oEvent) {
      var aCD = oEvent.mParameters.tokens[0].getCustomData('token')
      var findCD = function (key) {
        var o = aCD.find(function (c) { return c.getKey && c.getKey() === key; });
        return o ? o.getValue() : "";
      };

      var sType = findCD("type");
      var sValue = findCD("value");

      var _removeKeyFromMCB = function (that, sId, sKey) {
        var oMCB = that.byId(sId);
        if (!oMCB) return;
        var aKeys = (oMCB.getSelectedKeys() || []).filter(function (k) { return k !== sKey; });
        oMCB.setSelectedKeys(aKeys);
      };

      switch (sType) {
        case "Year": _removeKeyFromMCB(this, "fYear", sValue); break;
        case "Quarter": _removeKeyFromMCB(this, "fQuarter", sValue); break;
        case "Month": _removeKeyFromMCB(this, "fMonth", sValue); break;
        case "Source Mill": _removeKeyFromMCB(this, "fSourceMill", sValue); break;
        case "Type of Sales": _removeKeyFromMCB(this, "fTypeSales", sValue); break;
        case "Product Category": _removeKeyFromMCB(this, "fProdCat", sValue); break;

        case "Quantity":
          this.getView().getModel("view").setProperty("/qty", { op: "", v1: "", v2: "" });
          break;

        case "USD":
          this.getView().getModel("view").setProperty("/usd", { op: "", v1: "", v2: "" });
          break;

        default:
      }

      this._onAnyFilterChange();
    },

    // Sort
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
        "Year", "Quater", "Month", "SourceMill", "TypeOfSales", "ProductCategory", "Quantity", "Usd"
      ];
      var aSorters = aFieldsInOrder.map(function (sPath) {
        return new Sorter(sPath, bDescending);
      });

      var oBinding = this.byId("salesTable").getBinding("items");
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
          new ViewSettingsItem({ text: "Year", key: "Year" }),
          new ViewSettingsItem({ text: "Quarter", key: "Quater" }),
          new ViewSettingsItem({ text: "Month", key: "Month" }),
          new ViewSettingsItem({ text: "Source Mill", key: "SourceMill" }),
          new ViewSettingsItem({ text: "Type of Sales", key: "TypeOfSales" }),
          new ViewSettingsItem({ text: "Product Category", key: "ProductCategory" }),
          new ViewSettingsItem({ text: "Quantity", key: "Quantity" }),
          new ViewSettingsItem({ text: "USD Value", key: "Usd" })
        ].forEach(function (o) { that._oVSD.addSortItem(o); });

        this.getView().addDependent(this._oVSD);
      }

      this._oVSD.open();
    },

    _applySingleSort: function (sPath, bDescending) {
      var oBinding = this.byId("salesTable").getBinding("items");
      if (oBinding) {
        oBinding.sort([new Sorter(sPath, bDescending)]);
      }
    },

    _clearSort: function () {
      var oBinding = this.byId("salesTable").getBinding("items");
      if (oBinding) {
        oBinding.sort([]);
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

    _createChartDialog: function () {
      var oView = this.getView();
      var that = this;

      // Prepare models on first open
      var oChartMeta = new JSONModel({
        ChartType: "column",           // column | bar | line | pie | donut | dual_column
        Measure: "Quantity",           // Quantity | USD Value  (ignored if dual_column)
        DimensionKey: "",              // filled from available columns
        Dimensions: [],                // [{key,text}]
        YearForPeriod: "",             // NEW: optional filter when dimension is Month / Quarter
        YearOptions: []                // NEW: populated from data
      });
      oView.setModel(oChartMeta, "chartMeta");

      var oChartModel = new JSONModel({ ChartData: [] });
      oView.setModel(oChartModel, "chartModel");

      return Fragment.load({
        id: oView.getId(),
        name: "zsd_sales_ovw.fragment.GenerateChart",
        controller: this
      }).then(function (oDialog) {
        oView.addDependent(oDialog);
        oDialog.attachAfterOpen(that._onChartDialogAfterOpen.bind(that));
        return oDialog;
      });
    },

    _onChartDialogAfterOpen: function () {
      // Connect popover → vizframe
      var oView = this.getView();
      var oPopover = oView.byId("vfPopover");
      var oVizFrame = oView.byId("vfSales");
      if (oPopover && oVizFrame) {
        oPopover.connect(oVizFrame.getVizUid());
      }

      // Build dimension list from table’s current data/columns
      this._refreshChartDimensions();

      // NEW: Prepare Year options from available rows
      var aRows = this._getCurrentTableData();
      var aYears = Array.from(new Set(
        (aRows || []).map(function (r) { return r.Year; })
          .filter(function (y) { return y !== null && y !== undefined && y !== ""; })
      )).sort(function (a, b) { return String(a).localeCompare(String(b)); });

      var aYearOpts = aYears.map(function (y) { return { key: String(y), text: String(y) }; });

      var oMeta = oView.getModel("chartMeta");
      oMeta.setProperty("/YearOptions", aYearOpts);

      // Initial chart build
      this._rebuildChart();
    },

    onChartDialogCancel: function () {
      var oDlg = this.getView().byId("chartOptionsDialog");
      oDlg && oDlg.close();
    },

    onChartDialogAfterClose: function () {
      // keep instance; nothing special
    },

    onChartTypeChange: function (oEvent) {
      var sKey = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("chartMeta").setProperty("/ChartType", sKey);
      // if dual, force both measures (UI disables measure picker already)
      this._rebuildChart();
    },

    onMeasureChange: function (oEvent) {
      var sKey = oEvent.getParameter("item").getKey(); // SegmentedButton
      this.getView().getModel("chartMeta").setProperty("/Measure", sKey);
      this._rebuildChart();
    },

    onDimensionChange: function (oEvent) {
      var sKey = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("chartMeta").setProperty("/DimensionKey", sKey);
      this._rebuildChart();
    },

    /* Build list of possible dimensions (non-measure columns) */
    _refreshChartDimensions: function () {
      var oVM = this.getView().getModel("chartMeta");
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
      var oTable = this.byId("salesTable");
      var oBinding = oTable && oTable.getBinding("items");
      if (oBinding) {
        var aCtx = oBinding.getCurrentContexts();
        if (aCtx && aCtx.length) {
          try {
            return aCtx.map(function (c) { return c.getObject(); });
          } catch (e) {
            // fall through
          }
        }
      }
      // Fallback: full model data
      var aAll = this.oGlobalModel.getProperty("/SalesData") || [];
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
        "TypeOfSales": "Type of Sales",
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


    _rebuildChart: function () {
      var oView = this.getView();
      var oViz = oView.byId("vfSales");
      if (!oViz) { return; }

      // Read meta
      var oMeta = (oView.getModel("chartMeta") && oView.getModel("chartMeta").getData()) || {};
      var sDimKey = oMeta.DimensionKey;
      var sChartKey = oMeta.ChartType || "column";
      var sMeasureChoice = oMeta.Measure || "Quantity";

      // If no dimension chosen yet, clear chart
      if (!sDimKey) {
        oView.getModel("chartModel").setProperty("/ChartData", []);
        // Minimal viz props to avoid old state noise
        try { oViz.setVizProperties({ title: { visible: true, text: "No dimension selected" } }); } catch (e) { }
        return;
      }

      // Gather rows (current table view or full set)
      var aRows = this._getCurrentTableData() || [];

      // Normalize 'Quarter' / 'Quater'
      var sQuarterKey = "Quater";
      if (aRows.length && !("Quater" in aRows[0]) && ("Quarter" in aRows[0])) {
        sQuarterKey = "Quarter";
      }

      // Optional year filter when dimension = Month / Quarter
      var bPeriodDim = (sDimKey === "Month" || sDimKey === "Quarter" || sDimKey === "Quater");
      var bYearActive = !!oMeta.YearForPeriod && bPeriodDim;

      // Aggregate
      var mAgg = Object.create(null); // dim -> { Dimension, Quantity, USDValue }
      for (var i = 0; i < aRows.length; i++) {
        var r = aRows[i];

        if (bYearActive) {
          if (String(r.Year) !== String(oMeta.YearForPeriod)) {
            continue;
          }
        }

        var dimRaw = (sDimKey === "Quarter" || sDimKey === "Quater") ? r[sQuarterKey] : r[sDimKey];
        if (dimRaw === null || dimRaw === undefined || dimRaw === "") { continue; }

        var dim = String(dimRaw);
        var qty = Number(r.Quantity || 0);
        var usd = Number(r.USDInvoiceValue || r.Usd || 0);

        if (!isFinite(qty)) { qty = 0; }
        if (!isFinite(usd)) { usd = 0; }

        if (!mAgg[dim]) {
          mAgg[dim] = { Dimension: dim, Quantity: 0, USDValue: 0 };
        }
        mAgg[dim].Quantity += qty;
        mAgg[dim].USDValue += usd;
      }

      var aAgg = Object.keys(mAgg).map(function (k) { return mAgg[k]; });

      // Bind data to the chart model
      oView.getModel("chartModel").setProperty("/ChartData", aAgg);

      // Decide viz type safely
      var sVizType = this._getVizTypeForKey(sChartKey);
      try { oViz.setVizType(sVizType); } catch (e) {
        // fallback to column if mapping not supported in this runtime
        try { oViz.setVizType("column"); } catch (e2) { }
      }

      // Build title
      var sPrettyDim = (function _pretty(k) {
        var map = {
          "Year": "Year",
          "Quater": "Quarter",
          "Quarter": "Quarter",
          "Month": "Month",
          "SourceMill": "Source Mill",
          "TypeOfSales": "Type of Sales",
          "ProductCategory": "Product Category"
        };
        return map[k] || String(k).replace(/([A-Z])/g, " $1").trim();
      })(sDimKey);

      var sTitleMeasure = (sChartKey === "dual_column") ? "Quantity & USD Value"
        : (sMeasureChoice === "USD Value" ? "USD Value" : "Quantity");

      var sTitle = (sChartKey === "pie" || sChartKey === "donut")
        ? (sTitleMeasure + " by " + sPrettyDim)
        : (sPrettyDim + " vs " + sTitleMeasure);

      if (bPeriodDim) {
        sTitle += " " + (oMeta.YearForPeriod ? ("(Year: " + oMeta.YearForPeriod + ")") : "(All Years)");
      }

      // Optional: short number patterns only if formatter exists
      var sShort = null, sShort2 = null;
      try {
        if (ChartFormatter && ChartFormatter.DefaultPattern) {
          sShort = ChartFormatter.DefaultPattern.SHORTFLOAT;
          sShort2 = ChartFormatter.DefaultPattern.SHORTFLOAT_MFD2;
        }
      } catch (e) { /* ignore */ }

      // Build viz properties safely (skip unknown props)
      var mVizProps = {
        title: { visible: true, text: sTitle },
        legend: { visible: true },
        plotArea: { dataLabel: { visible: true } },
        interaction: { zoom: true }
      };
      // Axes (only for non-pie charts)
      if (sChartKey !== "pie" && sChartKey !== "donut") {
        mVizProps.categoryAxis = { title: { visible: true, text: "Dimension: " + sPrettyDim } };
        mVizProps.valueAxis = { title: { visible: true, text: sTitleMeasure } };
        if (sShort) {
          mVizProps.valueAxis.label = { formatString: sShort };
        }
        if (sChartKey === "dual_column") {
          mVizProps.valueAxis2 = {
            title: { visible: true, text: "USD Value" }
          };
          if (sShort) {
            mVizProps.valueAxis2.label = { formatString: sShort };
          }
        }
        if (sShort2) {
          mVizProps.plotArea.dataLabel.formatString = sShort2;
        }
      } else {
        // Pie/Donut: allow short labels on data labels if available
        if (sShort2) {
          mVizProps.plotArea.dataLabel.formatString = sShort2;
        }
      }

      try { oViz.setVizProperties(mVizProps); } catch (e) {
        // If some property path not supported in this runtime, ignore
        // console.warn("Viz properties error:", e);
      }

      // Reset and add feeds according to type
      try { oViz.removeAllFeeds(); } catch (e) { }

      if (sChartKey === "pie" || sChartKey === "donut") {
        var sMeasurePie = (sMeasureChoice === "USD Value") ? "USD Value" : "Quantity";
        try {
          oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: "size", type: "Measure", values: [sMeasurePie]
          }));
          oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: "color", type: "Dimension", values: ["Dimension"]
          }));
        } catch (e) { }
      } else if (sChartKey === "dual_column") {
        try {
          oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: "categoryAxis", type: "Dimension", values: ["Dimension"]
          }));
          oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: "valueAxis", type: "Measure", values: ["Quantity"]
          }));
          oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: "valueAxis2", type: "Measure", values: ["USD Value"]
          }));
        } catch (e) { }
      } else {
        var sMeasure = (sMeasureChoice === "USD Value") ? "USD Value" : "Quantity";
        try {
          oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: "categoryAxis", type: "Dimension", values: ["Dimension"]
          }));
          oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
            uid: "valueAxis", type: "Measure", values: [sMeasure]
          }));
        } catch (e) { }
      }

      // Avoid calling getDataset().invalidate() — not always available
      // Just ensure model is updated (already done) and let Viz re-render
      try { oViz.invalidate(); } catch (e) { }
    },

    _getVizTypeForKey: function (sKey) {
      // Map our UI keys to real VizFrame types
      switch (sKey) {
        case "column": return "column";
        case "bar": return "bar";
        case "line": return "line";
        case "pie": return "pie";
        case "donut": return "donut";
        case "dual_column":  // Some runtimes prefer 'dual_combination'
          return "dual_column"; // if this fails, change to "dual_combination"
        default:
          return "column";
      }
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
        .getModel("chartMeta")
        .setProperty("/YearForPeriod", sKey);

      // Rebuild the chart with month/quarter + year combination
      this._rebuildChart();
    },

    /* ---------- Numeric format helpers for table ---------- */
    formatShortNumber: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      return this._toShort(n, 2); // e.g. 286223.6 -> 286.22K
    },

    formatShortCurrency: function (v) {
      var n = Number(v);
      if (!isFinite(n)) return "";
      return this._toShort(n, 2); // e.g. 35579298004.34 -> 35.58B
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
        // keep up to d decimals, then trim trailing zeros
        var s = x.toFixed(d);
        // remove trailing zeros and trailing dot
        s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
        return s;
      }

      if (abs >= 1e12) return sign + fmt(abs / 1e12) + "T";
      if (abs >= 1e9) return sign + fmt(abs / 1e9) + "B";
      if (abs >= 1e6) return sign + fmt(abs / 1e6) + "M";
      if (abs >= 1e3) return sign + fmt(abs / 1e3) + "K";
      // small numbers: show up to 2 decimals with grouping
      var oFmt = NumberFormat.getFloatInstance({
        maxFractionDigits: d,
        minFractionDigits: 0,
        groupingEnabled: true
      });
      return sign + oFmt.format(abs);
    },


  });
});