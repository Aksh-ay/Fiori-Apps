sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/m/MessageToast",
  "sap/ui/model/json/JSONModel",
  "sap/ui/export/Spreadsheet",
  "sap/ui/table/Table",
  "sap/ui/table/Column",
  "sap/m/Label",
  "sap/m/Text",
  "sap/viz/ui5/controls/common/feeds/FeedItem"
], function (Controller, Fragment, MessageToast, JSONModel, Spreadsheet, UITable, UIColumn, Label, Text, FeedItem,) {
  "use strict";
  return Controller.extend("zsd_sales_ovw.controller.Main", {

    /* =========================================================
     * INIT
     * ======================================================= */
    onInit: function () {
      var that = this;
      this.oGlobalModel = this.getOwnerComponent().getModel("oGlobalModel");

      const oChartModel = new sap.ui.model.json.JSONModel({
        ChartData: [
          { ProductCategory: "Steel", Quantity: 120, USDInvoiceValue: 45000 },
          { ProductCategory: "Cement", Quantity: 80, USDInvoiceValue: 32000 },
          { ProductCategory: "Chemicals", Quantity: 60, USDInvoiceValue: 25000 },
          { ProductCategory: "Plastics", Quantity: 40, USDInvoiceValue: 18000 },
          { ProductCategory: "Textiles", Quantity: 30, USDInvoiceValue: 12000 }
        ]
      });
      this.getView().setModel(oChartModel, "chartModel");

      // Also set chartMeta defaults
      const oChartMeta = new sap.ui.model.json.JSONModel({
        ChartType: "column",
        Measure: "Quantity"
      });
      this.getView().setModel(oChartMeta, "chartMeta");

      // Expect chartModel to be set by parent (contains /ChartData)
      // If you want to set it here, you can uncomment and load it as needed.
      // const oChartModel = new JSONModel({ ChartData: [] });
      // this.getView().setModel(oChartModel, "chartModel");

      this._pDialog = null;

    },

    onTabSelect: function (oEvent) {
      var sKey = oEvent.getParameter("key");
      if (sKey === "historical") {
        // Rebuild when switching to Historical (optional)
        // this._buildHistoricalDefault();
      }
    },
    /* ==========================================================
       Dialog lifecycle
       ========================================================== */

    onGenerateChart: function () {
      if (!this._pDialog) {
        this._pDialog = this._createDialog();
      }
      this._pDialog.then(function (oDialog) {
        oDialog.open();
      });
    },

    _createDialog: function () {
      const oView = this.getView();
      const that = this;
      return Fragment.load({
        id: oView.getId(),
        name: "zsd_sales_ovw.fragment.GenerateChart",
        controller: this
      }).then(function (oDialog) {
        oView.addDependent(oDialog);
        // Connect popover to vizframe once created in afterOpen
        oDialog.attachAfterOpen(that._onDialogAfterOpen.bind(that));
        return oDialog;
      });
    },

    _onDialogAfterOpen: function () {
      // After the dialog opens, wire up popover to vizframe
      const oView = this.getView();
      const oPopover = oView.byId("vfPopover");
      const oVizFrame = oView.byId("vfSales");
      if (oPopover && oVizFrame) {
        oPopover.connect(oVizFrame.getVizUid());
      }

      // Build initial chart
      this._rebuildChart();
    },

    onChartDialogAfterClose: function () {
      // Optional: cleanup feeds/properties if you recreate dialog every time
      // (Here we keep the dialog instance for reuse)
    },

    onChartDialogCancel: function () {
      const oDialog = this.getView().byId("chartOptionsDialog");
      if (oDialog) {
        oDialog.close();
      }
    },

    onChartDialogApply: function () {
      // Apply selections to the main chart or trigger an event to parent
      // Here we simply close. In a real app, you might fire an event:
      // this.getView().fireEvent("ChartOptionsApplied", { meta: this.getView().getModel("chartMeta").getData() });
      MessageToast.show("Chart options applied");
      const oDialog = this.getView().byId("chartOptionsDialog");
      if (oDialog) {
        oDialog.close();
      }
    },

    /* ==========================================================
       UI event handlers from fragment
       ========================================================== */

    onChartTypeChange: function (oEvent) {
      const sKey = oEvent.getParameter("selectedItem").getKey();
      this.getView().getModel("chartMeta").setProperty("/ChartType", sKey);
      this._rebuildChart();
    },

    onMeasureChange: function (oEvent) {
      const sKey = oEvent.getParameter("item").getKey(); // SegmentedButton
      this.getView().getModel("chartMeta").setProperty("/Measure", sKey);
      this._rebuildChart();
    },

    onChartFilterChange: function () {
      // Read all MultiComboBoxes and update chartMeta
      const oView = this.getView();
      const oMeta = this.getView().getModel("chartMeta");

      oMeta.setProperty("/Year", this._getSelectedKeys(oView.byId("mcbYear")));
      oMeta.setProperty("/Quater", this._getSelectedKeys(oView.byId("mcbQuarter"))); // Keep your data spelling
      oMeta.setProperty("/Month", this._getSelectedKeys(oView.byId("mcbMonth")));
      oMeta.setProperty("/TypeOfSales", this._getSelectedKeys(oView.byId("mcbSalesType")));

      this._rebuildChart();
    },

    /* ==========================================================
       Chart building helpers
       ========================================================== */

    _getSelectedKeys: function (oMCB) {
      if (!oMCB) return [];
      return oMCB.getSelectedItems().map(function (oItem) {
        return oItem.getKey();
      });
    },

    _rebuildChart: function () {
      const oView = this.getView();
      const oVizFrame = oView.byId("vfSales");
      if (!oVizFrame) {
        return;
      }

      const oMeta = oView.getModel("chartMeta").getData();
      const aRaw = oView.getModel("chartModel").getProperty("/ChartData") || [];

      // 1) Filter raw data
      const aFiltered = aRaw.filter(function (d) {
        const passYear = !oMeta.Year?.length || oMeta.Year.includes(String(d.Year));
        const passQt = !oMeta.Quater?.length || oMeta.Quater.includes(String(d.Quater || d.Quarter || d.quarter));
        const passMonth = !oMeta.Month?.length || oMeta.Month.includes(String(d.Month || d.month));
        const passType = !oMeta.TypeOfSales?.length || oMeta.TypeOfSales.includes(String(d.TypeOfSales || d.SalesType));
        return passYear && passQt && passMonth && passType;
      });

      // 2) Aggregate by ProductCategory
      const mAgg = {}; // { ProductCategory: { Quantity: sum, USDInvoiceValue: sum } }
      aFiltered.forEach(function (d) {
        const cat = String(d.ProductCategory || d["Product Category"] || d.ProductCat);
        const qty = Number(d.Quantity || 0);
        const usd = Number(d.USDInvoiceValue || d.Usd || 0);
        if (!mAgg[cat]) {
          mAgg[cat] = { ProductCategory: cat, Quantity: 0, USDInvoiceValue: 0 };
        }
        mAgg[cat].Quantity += isFinite(qty) ? qty : 0;
        mAgg[cat].USDInvoiceValue += isFinite(usd) ? usd : 0;
      });

      const aAgg = Object.values(mAgg);

      // 3) Feed aggregated data back to chartModel (you can keep a separate path if preferred)
      oView.getModel("chartModel").setProperty("/ChartData", aAgg);

      // 4) Configure vizType
      oVizFrame.setVizType(oMeta.ChartType);

      // 5) Set vizProperties (appearance, titles, legend)
      oVizFrame.setVizProperties({
        plotArea: {
          dataLabel: { visible: true }
        },
        legend: { visible: true },
        title: {
          visible: true,
          text: this._buildChartTitle(oMeta)
        },
        interaction: {
          zoom: true,
          selectability: { mode: "single" }
        },
        categoryAxis: {
          title: { visible: true, text: "Product Category" }
        },
        valueAxis: {
          title: { visible: true, text: (oMeta.Measure === "USD Value" ? "USD Value" : "Quantity") }
        }
      });

      // 6) Reset feeds and add new ones according to chart type / measure
      oVizFrame.removeAllFeeds();

      const oCatFeed = new FeedItem({
        uid: "categoryAxis",
        type: "Dimension",
        values: ["Product Category"]
      });

      // Single-measure vs dual
      if (oMeta.ChartType === "dual_column") {
        const oValFeed1 = new FeedItem({
          uid: "valueAxis",
          type: "Measure",
          values: ["Quantity"]
        });
        const oValFeed2 = new FeedItem({
          uid: "valueAxis2",
          type: "Measure",
          values: ["USD Value"]
        });
        oVizFrame.addFeed(oCatFeed);
        oVizFrame.addFeed(oValFeed1);
        oVizFrame.addFeed(oValFeed2);

        // Adjust axes titles for dual axis
        oVizFrame.setVizProperties({
          valueAxis: { title: { visible: true, text: "Quantity" } },
          valueAxis2: { title: { visible: true, text: "USD Value" } }
        });

      } else if (oMeta.ChartType === "pie" || oMeta.ChartType === "donut") {
        const sMeasure = (oMeta.Measure === "USD Value") ? "USD Value" : "Quantity";
        const oValFeed = new FeedItem({
          uid: "size",
          type: "Measure",
          values: [sMeasure]
        });
        const oColorFeed = new FeedItem({
          uid: "color",
          type: "Dimension",
          values: ["Product Category"]
        });
        oVizFrame.addFeed(oValFeed);
        oVizFrame.addFeed(oColorFeed);

      } else { // column, bar, line
        const sMeasure = (oMeta.Measure === "USD Value") ? "USD Value" : "Quantity";
        const oValFeed = new FeedItem({
          uid: (oMeta.ChartType === "line" ? "valueAxis" : "valueAxis"),
          type: "Measure",
          values: [sMeasure]
        });
        const sCatUid = (oMeta.ChartType === "bar") ? "categoryAxis" : "categoryAxis";
        oCatFeed.setUid(sCatUid);

        oVizFrame.addFeed(oCatFeed);
        oVizFrame.addFeed(oValFeed);
      }

      // 7) (Optional) Refresh binding to ensure dataset re-evaluation
      oVizFrame.getDataset()?.invalidate();
    },

    _buildChartTitle: function (oMeta) {
      const aParts = [];
      aParts.push("Product Category vs " + (oMeta.ChartType === "dual_column" ? "Quantity & USD Value" : oMeta.Measure));
      if (oMeta.Year?.length) aParts.push("Year: " + oMeta.Year.join(", "));
      if (oMeta.Quater?.length) aParts.push("Quarter: " + oMeta.Quater.join(", "));
      if (oMeta.Month?.length) aParts.push("Month: " + oMeta.Month.join(", "));
      if (oMeta.TypeOfSales?.length) aParts.push("Sales: " + oMeta.TypeOfSales.join(", "));
      return aParts.join(" | ");
    }

  });
});
