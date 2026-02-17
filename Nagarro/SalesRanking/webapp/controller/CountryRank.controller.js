
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/ui/export/Spreadsheet"
], function (
  BaseController, JSONModel, MessageBox, Filter, FilterOperator, Sorter, Spreadsheet
) {
  "use strict";

  return BaseController.extend("zsd_sales_rank.controller.CountryRank", {

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
      var oDSC = this.byId("dsc");
      oDSC && oDSC.setShowSideContent(false);

      // View model (numeric filters + chips)
      var oViewModel = new JSONModel({
        qty: { op: "", v1: "", v2: "" },
        usd: { op: "", v1: "", v2: "" },
        pct: { op: "", v1: "", v2: "" },   // Quantity %
        usdpct: { op: "", v1: "", v2: "" },   // USD %
        rank: { op: "", v1: "", v2: "" },   // Rank
        filterChips: [],
        filterChipsTop: [],
        filterChipsBottom: [],
        filterSummary: ""
      });
      this.getView().setModel(oViewModel, "view");

      // Global JSON model & OData model from Component
      this.oGlobalModel = this.getOwnerComponent().getModel("oGlobalModel");
      this.SalesRankModel = this.getOwnerComponent().getModel("SalesRankModel");

      // app state for server params (Country rank view)
      this._state = {
        Dimension: "COUNTRY",   // fixed for this view
        SortBy: "USD",          // or 'QTY' (driven by radio)
        DateFrom: "00000000",
        DateTo: "00000000",
        TopN: 50,               // overridden by input if provided
        BottomN: 0,
        Bukrs: ""
      };

      // Whether current table slice should avoid client-side resort/limit (because server returned ranked subset)
      this._fromBackendRank = true;

      // Initial fetch
      this._loadFromBackend();
    },

    /* ===========================
     * OData Load (SERVER)
     * =========================== */
    _loadFromBackend: function () {
      var oView = this.getView();
      var oModel = this.SalesRankModel;
      var oGM = this.oGlobalModel;

      if (!oModel) {
        MessageBox.error("OData model 'SalesRankModel' not found on Component.");
        return;
      }

      // Build server parameters from UI controls
      var sMode = this._getRankMode();     // "Top" | "Bottom"
      var sMetric = this._getMetric();       // "Quantity" | "Usd"
      var nRank = this._getRankCount();    // integer or NaN

      // Map metric to server SortBy
      this._state.SortBy = (sMetric === "Usd") ? "USD" : "QTY";

      // Top/Bottom N mapping
      var iTop = 0;
      var iBottom = 0;
      if (Number.isFinite(nRank) && nRank > 0) {
        if (sMode === "Top") { iTop = nRank; }
        else { iBottom = nRank; }
      }
      this._state.TopN = iTop;
      this._state.BottomN = iBottom;

      // Build $filter list (artificial properties read in DPC_EXT)

      var aFilters = [
        new sap.ui.model.Filter("Dimension", sap.ui.model.FilterOperator.EQ, "COUNTRY"),
        new sap.ui.model.Filter("Sortby", sap.ui.model.FilterOperator.EQ, this._state.SortBy), // 'USD' or 'QTY'
        new sap.ui.model.Filter("Topn", sap.ui.model.FilterOperator.EQ, String(this._state.TopN)),     // '0' or '50'
        new sap.ui.model.Filter("Bottomn", sap.ui.model.FilterOperator.EQ, String(this._state.BottomN))   // '0'
      ];
      // Optional:
      if (this._state.Bukrs) {
        aFilters.push(new sap.ui.model.Filter("Bukrs", sap.ui.model.FilterOperator.EQ, this._state.Bukrs));
      }


      if (this._state.Bukrs) {
        aFilters.push(new Filter("Bukrs", FilterOperator.EQ, this._state.Bukrs));
      }

      // Keep payload small
      var sSelect = "Zyear,Country,Quantity,QuantityPrc,UsdValue,UsdPrc";
      // Let server return in rank order (USD/QTY direction is already handled by AMDP using RANK)
      var sOrderby = (this._state.SortBy === "USD" ? "UsdValue" : "Quantity") + " desc";

      oView.setBusy(true);

      // NOTE: if your EntitySet name differs, change it here (e.g., "/ZC_RANKINGSet")
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
            // Map to client shape used by your table & value helps
            var aMapped = aRows.map(function (r) {
              return {
                Year: r.Zyear || "",
                Country: r.Country || "",
                Quantity: Number(r.Quantity) || 0,
                QuantityPct: Number(r.QuantityPrc) || 0,
                Usd: Number(r.UsdValue) || 0,
                UsdPct: Number(r.UsdPrc) || 0
              };
            });

            // Assign rank based on the returned order
            aMapped.forEach(function (row, idx) { row.Rank = idx + 1; });

            // Store the full dataset; visible slice will be computed locally (without re-limit or resort)
            oGM.setProperty("/CountryDataAll", aMapped);

            // Build value helps from server data
            this._refreshValueHelps();

            // Mark that ranking/slicing is already applied by backend
            this._fromBackendRank = true;

            // Apply any additional client filters (numeric, country selection) but DO NOT re-sort or re-slice
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
          MessageBox.error("Failed to load ranking from backend.\n" + sMsg);
        }
      });
    },

    /* ===========================
     * Export
     * =========================== */
    onExportExcel: function () {
      var oModel = this.getOwnerComponent().getModel("oGlobalModel");
      // Export what is currently visible
      var aData = oModel.getProperty("/CountryData") || [];
      var aCols = this._createColumnConfig();

      var oSheet = new Spreadsheet({
        workbook: { columns: aCols },
        dataSource: aData,
        fileName: "CountryRanking.xlsx"
      });

      oSheet.build()
        .then(function () { oSheet.destroy(); })
        .catch(function (err) { MessageBox.error("Export failed: " + err); });
    },

    _createColumnConfig: function () {
      return [
        { label: "Country", property: "Country", type: "string" },
        { label: "Quantity", property: "Quantity", type: "number" },
        { label: "Quantity %", property: "QuantityPct", type: "number" },
        { label: "USD Value", property: "Usd", type: "number" },
        { label: "USD %", property: "UsdPct", type: "number" },
        { label: "Rank", property: "Rank", type: "number" }
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
      // Reserved
    },

    /* ===========================
     * Value helps (Country)
     * =========================== */
    _refreshValueHelps: function () {
      var aData = this.oGlobalModel.getProperty("/CountryDataAll") || [];

      function uniqSorted(mapper) {
        return Array.from(
          new Set(
            aData.map(mapper).filter(function (v) { return v !== undefined && v !== null && v !== ""; })
          )
        ).sort();
      }

      var aCountries = uniqSorted(function (r) { return r.Country; });

      this.oGlobalModel.setProperty("/CountryList", aCountries.map(function (v) {
        return ({ key: String(v), text: String(v) });
      }));
    },

    refreshValueHelpsFromData: function () {
      this._refreshValueHelps();
    },

    /* ===========================
     * Live filter events wiring
     * =========================== */
    _wireLiveFilterEvents: function () {
      var aMCBIds = ["fCountry"];
      aMCBIds.forEach(function (sId) {
        var oMCB = this.byId(sId);
        if (oMCB && oMCB.attachSelectionFinish) {
          oMCB.attachSelectionFinish(this._onAnyFilterChange, this);
        }
      }, this);

      ["fQtyOp", "fUsdOp", "fPctOp", "fUsdPctOp", "fRankOp"].forEach(function (sId) {
        var oSel = this.byId(sId);
        oSel && oSel.attachChange(this._onAnyFilterChange, this);
      }, this);

      ["fQtyVal1", "fQtyVal2",
        "fUsdVal1", "fUsdVal2",
        "fPctVal1", "fPctVal2",
        "fUsdPctVal1", "fUsdPctVal2",
        "fRankVal1", "fRankVal2"].forEach(function (sId) {
          var oInp = this.byId(sId);
          oInp && oInp.attachChange(this._onAnyFilterChange, this);
        }, this);
    },

    _onAnyFilterChange: function () {
      this.onApplyFilters();
    },

    /* ===========================
     * Top/Bottom + Metric + Count
     * =========================== */
    _getRankMode: function () {
      var oRBG = this.byId("rbgRankMode");
      // 0 = Top, 1 = Bottom
      return (oRBG && oRBG.getSelectedIndex && oRBG.getSelectedIndex() === 1) ? "Bottom" : "Top";
    },

    _getMetric: function () {
      var oRBG = this.byId("rbgMetric");
      // 0 = Quantity (default), 1 = USD
      var idx = oRBG && oRBG.getSelectedIndex ? oRBG.getSelectedIndex() : 0;
      return idx === 1 ? "Usd" : "Quantity";
    },

    _getRankCount: function () {
      var oInp = this.byId("inpRankCount");
      if (!oInp) return NaN;
      var n = parseInt(oInp.getValue(), 10);
      return Number.isFinite(n) ? n : NaN;
    },

    onRankModeChange: function () {
      // Re-fetch from backend to get correct Top/Bottom subset and normalized %
      this._loadFromBackend();
    },
    onRankCountLiveChange: function () {
      // Optional: debounce if needed. For simplicity call directly.
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
      // Only apply client-side attribute/number filters on the server-fetched subset
      this._rebuildVisibleData();
      this._updateFilterSummaryAndChips();
    },

    onResetFilters: function () {
      // Reset MultiComboBox selections
      ["fCountry"].forEach(function (sId) {
        var oMCB = this.byId(sId);
        if (oMCB && oMCB.removeAllSelectedItems) {
          oMCB.removeAllSelectedItems();
        }
      }, this);

      // Reset numeric filters
      var oVM = this.getView().getModel("view");
      oVM.setProperty("/qty", { op: "", v1: "", v2: "" });
      oVM.setProperty("/usd", { op: "", v1: "", v2: "" });
      oVM.setProperty("/pct", { op: "", v1: "", v2: "" });
      oVM.setProperty("/usdpct", { op: "", v1: "", v2: "" });
      oVM.setProperty("/rank", { op: "", v1: "", v2: "" });

      // Reset UI selections
      var oMetric = this.byId("rbgMetric"); oMetric && oMetric.setSelectedIndex(1); // set to USD briefly
      oMetric && oMetric.setSelectedIndex(0);                                      // back to Quantity
      var oMode = this.byId("rbgRankMode"); oMode && oMode.setSelectedIndex(0);
      var oInp = this.byId("inpRankCount"); oInp && oInp.setValue("");

      // Re-fetch (to reset server subset) then apply chips
      this._loadFromBackend();
    },

    /* ===========================
     * Central pipeline: apply **client filters only**
     * =========================== */
    _matchesNumberCfg: function (val, cfg) {
      if (!cfg || !cfg.op || cfg.v1 === "" || cfg.v1 === null || cfg.v1 === undefined) return true;
      var n1 = Number(cfg.v1);
      if (Number.isNaN(n1)) return true;
      var nVal = Number(val);
      switch (cfg.op) {
        case "EQ": return nVal === n1;
        case "NE": return nVal !== n1;
        case "GT": return nVal > n1;
        case "GE": return nVal >= n1;
        case "LT": return nVal < n1;
        case "LE": return nVal <= n1;
        case "BT":
          if (cfg.v2 === "" || cfg.v2 === null || cfg.v2 === undefined) return true;
          var n2 = Number(cfg.v2);
          if (Number.isNaN(n2)) return true;
          var low = Math.min(n1, n2);
          var high = Math.max(n1, n2);
          return nVal >= low && nVal <= high;
        default: return true;
      }
    },

    _rebuildVisibleData: function () {
      var oM = this.oGlobalModel;
      var aAll = (oM.getProperty("/CountryDataAll") || []).slice(0);

      // 1) Read current filter selections
      var aCountriesSelected = this.byId("fCountry") ? this.byId("fCountry").getSelectedKeys() : [];
      var oVM = this.getView().getModel("view");
      var cfgQty = oVM.getProperty("/qty");
      var cfgUsd = oVM.getProperty("/usd");
      var cfgPct = oVM.getProperty("/pct");
      var cfgUsdPct = oVM.getProperty("/usdpct");
      var cfgRank = oVM.getProperty("/rank");

      // 2) Apply client filters only
      var setCountries = new Set(aCountriesSelected || []);
      var aFiltered = aAll.filter(function (r) {
        var okCountry = setCountries.size ? setCountries.has(String(r.Country)) : true;
        var okQty = this._matchesNumberCfg(r.Quantity, cfgQty);
        var okUsd = this._matchesNumberCfg(r.Usd, cfgUsd);
        var okPct = this._matchesNumberCfg(r.QuantityPct, cfgPct);
        var okUsdPct = this._matchesNumberCfg(r.UsdPct, cfgUsdPct);
        var okRank = this._matchesNumberCfg(r.Rank, cfgRank);
        return okCountry && okQty && okUsd && okPct && okUsdPct && okRank;
      }.bind(this));

      // 3/4) DO NOT re-sort or re-slice when the subset already comes ranked from backend
      if (!this._fromBackendRank) {
        var mode = this._getRankMode(); // "Top" | "Bottom"
        var metric = this._getMetric();   // "Quantity" | "Usd"
        var desc = (mode === "Top");    // Top => DESC; Bottom => ASC
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

      oM.setProperty("/CountryData", aFiltered);
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

      addKeyChips("Country", this.byId("fCountry"));

      var sQty = this._formatNumberFilter("Quantity", oVM.getProperty("/qty"));
      var sUsd = this._formatNumberFilter("USD", oVM.getProperty("/usd"));
      var sPct = this._formatNumberFilter("Quantity %", oVM.getProperty("/pct"));
      var sUsdPct = this._formatNumberFilter("USD %", oVM.getProperty("/usdpct"));
      var sRank = this._formatNumberFilter("Rank", oVM.getProperty("/rank"));

      if (sQty) aChips.push({ key: "Quantity", text: sQty, type: "Quantity", value: "" });
      if (sUsd) aChips.push({ key: "USD", text: sUsd, type: "USD", value: "" });
      if (sPct) aChips.push({ key: "Quantity %", text: sPct, type: "Quantity %", value: "" });
      if (sUsdPct) aChips.push({ key: "USD %", text: sUsdPct, type: "USD %", value: "" });
      if (sRank) aChips.push({ key: "Rank", text: sRank, type: "Rank", value: "" });

      // Add a chip for Top/Bottom N by METRIC (if N is valid)
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
      var aCD = oEvent.mParameters.tokens[0].getCustomData('token');
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
        case "Country": _removeKeyFromMCB(this, "fCountry", sValue); break;
        case "Quantity": this.getView().getModel("view").setProperty("/qty", { op: "", v1: "", v2: "" }); break;
        case "USD": this.getView().getModel("view").setProperty("/usd", { op: "", v1: "", v2: "" }); break;
        case "Quantity %": this.getView().getModel("view").setProperty("/pct", { op: "", v1: "", v2: "" }); break;
        case "USD %": this.getView().getModel("view").setProperty("/usdpct", { op: "", v1: "", v2: "" }); break;
        case "Rank": this.getView().getModel("view").setProperty("/rank", { op: "", v1: "", v2: "" }); break;
        case "MetricView":
          var oMetric = this.byId("rbgMetric"); oMetric && oMetric.setSelectedIndex(0);
          var oMode = this.byId("rbgRankMode"); oMode && oMode.setSelectedIndex(0);
          var oInp = this.byId("inpRankCount"); oInp && oInp.setValue("");
          // Re-fetch from backend on reset of metric view
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
      // You can keep your ActionSheet/ViewSettingsDialog logic as-is if needed
    },

    _applySortAll: function (bDescending) {
      var aFieldsInOrder = ["Country", "Quantity", "QuantityPct", "Usd", "UsdPct", "Rank"];
      var aSorters = aFieldsInOrder.map(function (sPath) {
        return new Sorter(sPath, bDescending);
      });

      var oBinding = this.byId("idCountryTable").getBinding("items");
      if (oBinding) {
        oBinding.sort(aSorters);
      }
    },

    _applySingleSort: function (sPath, bDescending) {
      var oBinding = this.byId("idCountryTable").getBinding("items");
      if (oBinding) {
        oBinding.sort([new Sorter(sPath, bDescending)]);
      }
    },

    _clearSort: function () {
      var oBinding = this.byId("idCountryTable").getBinding("items");
      if (oBinding) {
        oBinding.sort([]);
      }
    }
  });
});
