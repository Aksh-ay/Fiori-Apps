
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
  "sap/ui/model/FilterOperator"
], function (
  BaseController, JSONModel, Spreadsheet, MessageBox,
  ActionSheet, Button, ViewSettingsDialog, ViewSettingsItem, Sorter,
  Filter, FilterOperator
) {
  "use strict";

  return BaseController.extend("zsd_sales_rank.controller.CompanyRank", {

    /* ===========================
     * Formatters
     * =========================== */
    formatUsd: function (v) {
      if (v === null || v === undefined || v === "") return "";
      try {
        return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      } catch (e) {
        return v;
      }
    },
    formatPct: function (v) {
      if (v === null || v === undefined || v === "") return "";
      try {
        return Number(v).toFixed(1) + " %";
      } catch (e) {
        return v + " %";
      }
    },

    /* ===========================
     * Lifecycle
     * =========================== */
    onInit: function () {
      this._syncToggleText();

      // Hide side content initially
      var oDSC = this.byId("dscCompanyRank");
      oDSC && oDSC.setShowSideContent(false);

      // View model (numeric filters + chips)
      var oViewModel = new JSONModel({
        qty:    { op: "", v1: "", v2: "" },
        usd:    { op: "", v1: "", v2: "" },
        pct:    { op: "", v1: "", v2: "" },   // Quantity %
        usdpct: { op: "", v1: "", v2: "" },   // USD %
        rank:   { op: "", v1: "", v2: "" },   // Rank
        filterChips: [],
        filterChipsTop: [],
        filterChipsBottom: [],
        filterSummary: ""
      });
      this.getView().setModel(oViewModel, "view");

      // Models from Component
      this.oGlobalModel   = this.getOwnerComponent().getModel("oGlobalModel");
      this.SalesRankModel = this.getOwnerComponent().getModel("SalesRankModel");

      // Server call state (Company-wise)
      this._state = {
        Dimension: "CUSTOMER",  // <-- important for company-wise
        SortBy: "USD",          // 'USD' | 'QTY' (toolbar)
        DateFrom: "00000000",   // let backend default if needed
        DateTo:   "00000000",
        TopN: 50,               // changed by input
        BottomN: 0,
        Bukrs: ""
      };

      // when true, do not re-sort or re-slice in client (server already ranked)
      this._fromBackendRank = true;

      // Initial backend load (replaces hard-coded data)
      this._loadFromBackend();

      // Live filter wiring
      this._wireLiveFilterEvents();
    },

    /* ===========================
     * BACKEND LOAD
     * =========================== */
    _loadFromBackend: function () {
      var oView  = this.getView();
      var oModel = this.SalesRankModel;
      var oGM    = this.oGlobalModel;

      if (!oModel) {
        MessageBox.error("OData model 'SalesRankModel' not found on Component.");
        return;
      }

      // Read toolbar selections
      var sMode   = this._getRankMode();   // "Top" | "Bottom"
      var sMetric = this._getMetric();     // "Quantity" | "Usd"
      var nRank   = this._getRankCount();  // integer or NaN

      // Map to server params
      this._state.SortBy = (sMetric === "Usd") ? "USD" : "QTY";
      this._state.TopN    = (Number.isFinite(nRank) && nRank > 0 && sMode === "Top")    ? nRank : 0;
      this._state.BottomN = (Number.isFinite(nRank) && nRank > 0 && sMode === "Bottom") ? nRank : 0;

      // Build $filter list (all Edm.Strings → UI5 will quote)
      var aFilters = [
        new Filter("Dimension", FilterOperator.EQ, this._state.Dimension),
        new Filter("Sortby",    FilterOperator.EQ, this._state.SortBy),
        new Filter("Topn",      FilterOperator.EQ, String(this._state.TopN)),
        new Filter("Bottomn",   FilterOperator.EQ, String(this._state.BottomN))
      ];
      if (this._state.Bukrs) {
        aFilters.push(new Filter("Bukrs", FilterOperator.EQ, this._state.Bukrs));
      }
      // Keep payload small – customer view needs sold-to/ship-to names
      var sSelect = "Zyear,SoldToParty,ShipToParty,Quantity,QuantityPrc,UsdValue,UsdPrc";
      var sOrderby = (this._state.SortBy === "USD" ? "UsdValue" : "Quantity") + " desc";

      oView.setBusy(true);

      // Adjust if your entity set name differs (e.g., "/ZC_RANKINGSet")
      var sEntitySet = "/SalesRankSet";

      oModel.read(sEntitySet, {
        filters: aFilters,
        urlParameters: {
          "$select": sSelect,
          "$orderby": sOrderby
        },
        success: function (oData) {
          try {
            var aRows = (oData && oData.results) ? oData.results : [];

            // Map service → client shape used by your table/value-helps
            var aMapped = aRows.map(function (r) {
              return {
                Year:        r.Zyear || "",
                ShipToParty: r.ShipToParty || "",
                SoldToParty: r.SoldToParty || "",
                Quantity:    Number(r.Quantity) || 0,
                QuantityPrc: Number(r.QuantityPrc) || 0,
                Usd:         Number(r.UsdValue) || 0,
                UsdPrc:      Number(r.UsdPrc) || 0
              };
            });

            // Rank based on returned order
            aMapped.forEach(function (row, idx) { row.Rank = idx + 1; });

            // Store ALL rows; visible slice computed locally (no re-sorting/slicing)
            oGM.setProperty("/CompanyDataAll", aMapped);

            // Build value helps from backend data
            this._refreshValueHelps();

            // Do not re-rank on client
            this._fromBackendRank = true;

            // Apply client-only filters (ship-to/sold-to, numeric)
            this._rebuildVisibleData();
            this._updateFilterSummaryAndChips();
          } catch (e) {
            MessageBox.error("Failed to process server response: " + e.message);
          } finally {
            oView.setBusy(false);
          }
        }.bind(this),
        error: function (oErr) {
          oView.setBusy(false);
          var sMsg = (oErr && oErr.responseText) ? oErr.responseText : (oErr && oErr.message) || "Unknown error";
          MessageBox.error("Failed to load company ranking from backend.\n" + sMsg);
        }
      });
    },

    /* ===========================
     * Export
     * =========================== */
    onExportExcel: function () {
      var oModel = this.getOwnerComponent().getModel("oGlobalModel");
      var aData = oModel.getProperty("/CompanyData") || [];
      var aCols = this._createColumnConfig();

      var oSheet = new Spreadsheet({
        workbook: { columns: aCols },
        dataSource: aData,
        fileName: "CompanyRanking.xlsx"
      });

      oSheet.build()
        .then(function () { oSheet.destroy(); })
        .catch(function (err) { MessageBox.error("Export failed: " + err); });
    },

    _createColumnConfig: function () {
      return [
        { label: "Ship-to Party", property: "ShipToParty", type: "string" },
        { label: "Sold-to Party", property: "SoldToParty", type: "string" },
        { label: "Quantity",      property: "Quantity",    type: "number" },
        { label: "Quantity %",    property: "QuantityPct", type: "number" },
        { label: "USD Value",     property: "Usd",         type: "number" },
        { label: "USD %",         property: "UsdPct",      type: "number" },
        { label: "Rank",          property: "Rank",        type: "number" }
      ];
    },

    /* ===========================
     * Side content toggle
     * =========================== */
    onToggleSideContent: function () {
      var oDSC = this.byId("dscCompanyRank");
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMainCompanyRank");
      oBtnMain.setVisible(true);
      oDSC.setShowSideContent(!bShow);
      this._syncToggleText();
    },

    onToggleMainContent: function () {
      var oDSC = this.byId("dscCompanyRank");
      var bShow = oDSC.getShowSideContent();
      var oBtnMain = this.byId("btnToggleMainCompanyRank");
      oDSC.setShowSideContent(!bShow);
      oBtnMain.setVisible(false);
    },

    _syncToggleText: function () {},

    /* ===========================
     * Value helps (Ship-to, Sold-to)
     * =========================== */
    _refreshValueHelps: function () {
      var aData = this.oGlobalModel.getProperty("/CompanyDataAll") || [];

      function uniqSorted(mapper) {
        return Array.from(new Set(
          aData.map(mapper).filter(function (v) { return v !== undefined && v !== null && v !== ""; })
        )).sort();
      }

      var aShipTo = uniqSorted(function (r) { return r.ShipToParty; });
      var aSoldTo = uniqSorted(function (r) { return r.SoldToParty; });

      this.oGlobalModel.setProperty("/ShipToList", aShipTo.map(function (v) { return ({ key: String(v), text: String(v) }); }));
      this.oGlobalModel.setProperty("/SoldToList", aSoldTo.map(function (v) { return ({ key: String(v), text: String(v) }); }));
    },

    refreshValueHelpsFromData: function () {
      this._refreshValueHelps();
    },

    /* ===========================
     * Live filter events wiring
     * =========================== */
    _wireLiveFilterEvents: function () {
      var aMCBIds = ["fShipToCompanyRank", "fSoldToCompanyRank"];
      aMCBIds.forEach(function (sId) {
        var oMCB = this.byId(sId);
        if (oMCB && oMCB.attachSelectionFinish) {
          oMCB.attachSelectionFinish(this._onAnyFilterChange, this);
        }
      }, this);

      ["fQtyOpCompanyRank", "fUsdOpCompanyRank", "fPctOpCompanyRank", "fUsdPctOpCompanyRank", "fRankOpCompanyRank"].forEach(function (sId) {
        var oSel = this.byId(sId);
        oSel && oSel.attachChange(this._onAnyFilterChange, this);
      }, this);

      ["fQtyVal1CompanyRank", "fQtyVal2CompanyRank",
       "fUsdVal1CompanyRank", "fUsdVal2CompanyRank",
       "fPctVal1CompanyRank", "fPctVal2CompanyRank",
       "fUsdPctVal1CompanyRank", "fUsdPctVal2CompanyRank",
       "fRankVal1CompanyRank", "fRankVal2CompanyRank"].forEach(function (sId) {
        var oInp = this.byId(sId);
        oInp && oInp.attachChange(this._onAnyFilterChange, this);
      }, this);
    },

    _onAnyFilterChange: function () {
      this.onApplyFilters();
    },

    /* ===========================
     * Top/Bottom + Metric (Radio)
     * =========================== */
    _getRankMode: function () {
      var oRBG = this.byId("rbgRankModeCompanyRank");
      // 0 = Top, 1 = Bottom
      return (oRBG && oRBG.getSelectedIndex && oRBG.getSelectedIndex() === 1) ? "Bottom" : "Top";
    },

    _getMetric: function () {
      var oRBG = this.byId("rbgMetricCompanyRank");
      // 0 = Quantity (default), 1 = USD
      var idx = oRBG && oRBG.getSelectedIndex ? oRBG.getSelectedIndex() : 0;
      return idx === 1 ? "Usd" : "Quantity";
    },

    _getRankCount: function () {
      var oInp = this.byId("inpRankCountCompanyRank");
      if (!oInp) return NaN;
      var n = parseInt(oInp.getValue(), 10);
      return Number.isFinite(n) ? n : NaN;
    },

    onRankModeChange: function () {
      // Re-fetch to get correct Top/Bottom subset and normalized %
      this._loadFromBackend();
    },
    onRankCountLiveChange: function () {
      this._loadFromBackend();
    },
    onRankCountChange: function () {
      this._loadFromBackend();
    },
    onMetricChange: function () {
      // Re-fetch to change server-side ranking measure
      this._loadFromBackend();
    },

    /* ===========================
     * Apply / Reset filters
     * =========================== */
    onApplyFilters: function () {
      // Only client filters; server already ranked/sliced
      this._rebuildVisibleData();
      this._updateFilterSummaryAndChips();
    },

    onResetFilters: function () {
      // Reset MultiComboBox selections
      ["fShipToCompanyRank", "fSoldToCompanyRank"].forEach(function (sId) {
        var oMCB = this.byId(sId);
        if (oMCB && oMCB.removeAllSelectedItems) {
          oMCB.removeAllSelectedItems();
        }
      }, this);

      // Reset numeric filters
      var oVM = this.getView().getModel("view");
      oVM.setProperty("/qty",    { op: "", v1: "", v2: "" });
      oVM.setProperty("/usd",    { op: "", v1: "", v2: "" });
      oVM.setProperty("/pct",    { op: "", v1: "", v2: "" });
      oVM.setProperty("/usdpct", { op: "", v1: "", v2: "" });
      oVM.setProperty("/rank",   { op: "", v1: "", v2: "" });

      // Reset UI selections
      var oMetric = this.byId("rbgMetricCompanyRank");   oMetric && oMetric.setSelectedIndex(0);
      var oMode   = this.byId("rbgRankModeCompanyRank"); oMode   && oMode.setSelectedIndex(0);
      var oInp    = this.byId("inpRankCountCompanyRank"); oInp   && oInp.setValue("");

      // Re-fetch server subset, then apply chips
      this._loadFromBackend();
    },

    /* ===========================
     * Client filter only (no re-rank)
     * =========================== */
    _matchesNumberCfg: function (val, cfg) {
      if (!cfg || !cfg.op || cfg.v1 === "" || cfg.v1 === null || cfg.v1 === undefined) return true;
      var n1 = Number(cfg.v1);
      if (Number.isNaN(n1)) return true;
      var nVal = Number(val);
      switch (cfg.op) {
        case "EQ": return nVal === n1;
        case "NE": return nVal !== n1;
        case "GT": return nVal >  n1;
        case "GE": return nVal >= n1;
        case "LT": return nVal <  n1;
        case "LE": return nVal <= n1;
        case "BT":
          if (cfg.v2 === "" || cfg.v2 === null || cfg.v2 === undefined) return true;
          var n2 = Number(cfg.v2);
          if (Number.isNaN(n2)) return true;
          var low  = Math.min(n1, n2);
          var high = Math.max(n1, n2);
          return nVal >= low && nVal <= high;
        default: return true;
      }
    },

    _rebuildVisibleData: function () {
      var oM  = this.oGlobalModel;
      var aAll = (oM.getProperty("/CompanyDataAll") || []).slice(0);

      // 1) Current selections
      var aShipToSelected = this.byId("fShipToCompanyRank") ? this.byId("fShipToCompanyRank").getSelectedKeys() : [];
      var aSoldToSelected = this.byId("fSoldToCompanyRank") ? this.byId("fSoldToCompanyRank").getSelectedKeys() : [];
      var oVM     = this.getView().getModel("view");
      var cfgQty    = oVM.getProperty("/qty");
      var cfgUsd    = oVM.getProperty("/usd");
      var cfgPct    = oVM.getProperty("/pct");
      var cfgUsdPct = oVM.getProperty("/usdpct");
      var cfgRank   = oVM.getProperty("/rank");

      // 2) Client filters only
      var setShipTo = new Set(aShipToSelected || []);
      var setSoldTo = new Set(aSoldToSelected || []);
      var aFiltered = aAll.filter(function (r) {
        var okShip = setShipTo.size ? setShipTo.has(String(r.ShipToParty)) : true;
        var okSold = setSoldTo.size ? setSoldTo.has(String(r.SoldToParty)) : true;
        var okQty     = this._matchesNumberCfg(r.Quantity,    cfgQty);
        var okUsd     = this._matchesNumberCfg(r.Usd,         cfgUsd);
        var okPct     = this._matchesNumberCfg(r.QuantityPct, cfgPct);
        var okUsdPct  = this._matchesNumberCfg(r.UsdPct,      cfgUsdPct);
        var okRank    = this._matchesNumberCfg(r.Rank,        cfgRank);
        return okShip && okSold && okQty && okUsd && okPct && okUsdPct && okRank;
      }.bind(this));

      // 3/4) Do NOT re-sort or re-slice when subset already comes ranked from backend
      if (!this._fromBackendRank) {
        var mode   = this._getRankMode(); // "Top" | "Bottom"
        var metric = this._getMetric();   // "Quantity" | "Usd"
        var desc   = (mode === "Top");    // Top => DESC; Bottom => ASC
        aFiltered.sort(function (a, b) {
          var av = Number(a[metric]) || 0;
          var bv = Number(b[metric]) || 0;
          return desc ? (bv - av) : (av - bv);
        });
        var n = this._getRankCount();
        if (Number.isFinite(n) && n > 0) {
          aFiltered = aFiltered.slice(0, Math.min(n, aFiltered.length));
        }
      }

      // 5) Bind visible rows
      oM.setProperty("/CompanyData", aFiltered);
    },

    /* ===========================
     * Chips
     * =========================== */
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

      addKeyChips("Ship-to Party", this.byId("fShipToCompanyRank"));
      addKeyChips("Sold-to Party", this.byId("fSoldToCompanyRank"));

      var sQty    = this._formatNumberFilter("Quantity",    oVM.getProperty("/qty"));
      var sUsd    = this._formatNumberFilter("USD",         oVM.getProperty("/usd"));
      var sPct    = this._formatNumberFilter("Quantity %",  oVM.getProperty("/pct"));
      var sUsdPct = this._formatNumberFilter("USD %",       oVM.getProperty("/usdpct"));
      var sRank   = this._formatNumberFilter("Rank",        oVM.getProperty("/rank"));

      if (sQty)    aChips.push({ key: "Quantity",   text: sQty,    type: "Quantity",   value: "" });
      if (sUsd)    aChips.push({ key: "USD",        text: sUsd,    type: "USD",        value: "" });
      if (sPct)    aChips.push({ key: "Quantity %", text: sPct,    type: "Quantity %", value: "" });
      if (sUsdPct) aChips.push({ key: "USD %",      text: sUsdPct, type: "USD %",      value: "" });
      if (sRank)   aChips.push({ key: "Rank",       text: sRank,   type: "Rank",       value: "" });

      // Top/Bottom N by METRIC (if N is valid)
      var n = this._getRankCount();
      var mode = this._getRankMode();
      var metric = this._getMetric() === "Quantity" ? "Quantity" : "USD";
      if (Number.isFinite(n) && n > 0) {
        aChips.push({
          key: "MetricView",
          text: mode + " " + n + " by " + metric,
          type: "MetricView",
          value: mode + ":" + metric + ":" + n
        });
      }

      oVM.setProperty("/filterChips", aChips);
      oVM.setProperty("/filterSummary", aChips.map(function (c) { return c.text; }).join("  •  "));

      var MAX_TOP_TOKENS = 6;
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

    onFilterTokenDelete: function (oEvent) {
      var aCD = oEvent.getParameter("tokens")[0].getCustomData("token");
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
        case "Ship-to Party": _removeKeyFromMCB(this, "fShipToCompanyRank", sValue); break;
        case "Sold-to Party": _removeKeyFromMCB(this, "fSoldToCompanyRank", sValue); break;
        case "Quantity":      this.getView().getModel("view").setProperty("/qty",    { op: "", v1: "", v2: "" }); break;
        case "USD":           this.getView().getModel("view").setProperty("/usd",    { op: "", v1: "", v2: "" }); break;
        case "Quantity %":    this.getView().getModel("view").setProperty("/pct",    { op: "", v1: "", v2: "" }); break;
        case "USD %":         this.getView().getModel("view").setProperty("/usdpct", { op: "", v1: "", v2: "" }); break;
        case "Rank":          this.getView().getModel("view").setProperty("/rank",   { op: "", v1: "", v2: "" }); break;
        case "MetricView":
          // Reset metric to Quantity, Top mode, and clear count, then re-fetch
          var oMetric = this.byId("rbgMetricCompanyRank"); oMetric && oMetric.setSelectedIndex(0);
          var oMode   = this.byId("rbgRankModeCompanyRank"); oMode && oMode.setSelectedIndex(0);
          var oInp    = this.byId("inpRankCountCompanyRank"); oInp && oInp.setValue("");
          this._loadFromBackend();
          break;
        default:
      }

      this._rebuildVisibleData();
      this._updateFilterSummaryAndChips();
    },

    /* ===========================
     * Sort actions (client-side on visible data)
     * =========================== */
    onOpenSortDialog: function () {
      // Keep your sort dialog logic if needed
    },

    _applySortAll: function (bDescending) {
      var aFieldsInOrder = ["ShipToParty", "SoldToParty", "Quantity", "QuantityPct", "Usd", "UsdPct", "Rank"];
      var aSorters = aFieldsInOrder.map(function (sPath) {
        return new Sorter(sPath, bDescending);
      });

      var oBinding = this.byId("salesTableCompanyRank").getBinding("items");
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
          new ViewSettingsItem({ text: "Ship-to Party", key: "ShipToParty" }),
          new ViewSettingsItem({ text: "Sold-to Party", key: "SoldToParty" }),
          new ViewSettingsItem({ text: "Quantity",      key: "Quantity" }),
          new ViewSettingsItem({ text: "Quantity %",    key: "QuantityPct" }),
          new ViewSettingsItem({ text: "USD Value",     key: "Usd" }),
          new ViewSettingsItem({ text: "USD %",         key: "UsdPct" }),
          new ViewSettingsItem({ text: "Rank",          key: "Rank" })
        ].forEach(function (o) { that._oVSD.addSortItem(o); });

        this.getView().addDependent(this._oVSD);
      }

      this._oVSD.open();
    },

    _applySingleSort: function (sPath, bDescending) {
      var oBinding = this.byId("salesTableCompanyRank").getBinding("items");
      if (oBinding) {
        oBinding.sort([new Sorter(sPath, bDescending)]);
      }
    },

    _clearSort: function () {
      var oBinding = this.byId("salesTableCompanyRank").getBinding("items");
      if (oBinding) {
        oBinding.sort([]);
      }
    }
  });
});
