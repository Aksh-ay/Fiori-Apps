sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/export/Spreadsheet",
    "sap/ui/table/Column",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/m/Token",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/format/NumberFormat"
], (Controller, JSONModel, Spreadsheet, Column, Label, Text, SelectDialog, StandardListItem, Token,
    Filter, FilterOperator, NumberFormat) => {
    "use strict";

    return Controller.extend("zsd_sales_week.controller.CategorizedView", {
        /* ===========================
         * Lifecycle
         * =========================== */
        onInit: function () {
            // Hide side content initially
            var oDSC = this.byId("idCategorizedDsc");
            oDSC && oDSC.setShowSideContent(false);

            // Initial scope - Execution Date (store once)
            this._initialScope = this._getBusinessWeek(new Date());
            this._defaultTableData = [];

            // -------------------------------
            // Local UI View Model
            // -------------------------------
            this.getView().setModel(new JSONModel({
                usdRows: [],
                qtyRows: []
            }));
        },
        onAfterRendering: function () {
            this._prepareLocalData();
        },

        /* =========================================================== */
        /* Public handlers                                             */
        /* =========================================================== */
        onBillDateChange: function (oEvent) {
            var oBillDate = oEvent.getParameter("newValue");
            var oBusinessWeek = this._getBusinessWeek(oBillDate);
            this._resetFilterData(new Date(oBillDate), oBusinessWeek);
            this._fetchTableData(oBusinessWeek.weekStartDate, oBusinessWeek.weekEndDate);
        },

        onApplyFilters: function () {
            var aFilters = [];
            var oData = this.getOwnerComponent().getModel("oFilterModel").getData() || {};

            /* ===============================
               1. MultiInput token filters
               =============================== */
            this._addMultiInputFilter(aFilters, "ContractNo");
            this._addMultiInputFilter(aFilters, "SalesOrderNo");
            this._addMultiInputFilter(aFilters, "ProductCategoryDesc");
            this._addMultiInputFilter(aFilters, "SoldToParty");
            this._addMultiInputFilter(aFilters, "ShipToParty");
            this._addMultiInputFilter(aFilters, "SoldToPartyName");


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
            this._prepareLocalData(aFilters);
        },

        onResetFilters: function () {
            this._resetFilterData();
            if (this._defaultTableData.length === 0) {
                this._fetchTableData(this._initialScope.weekStartDate, this._initialScope.weekEndDate);
            } else {
                // Restore first fetch snapshot
                this.getOwnerComponent().getModel("oTableModel").setData(this._defaultTableData.slice());
                this._prepareLocalData();
            }
        },

        onSyncTable: function () {
            this._resetFilterData();
            // Refresh Initial Data
            this._fetchTableData(this._initialScope.weekStartDate, this._initialScope.weekEndDate);
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
        _fetchTableData: function (sStarDate, sEndDate) {
            this.byId("idCategorizedPage").setBusy(true);
            this.getOwnerComponent().getModel().read("/ZSD_DAY_WEEK_SALES(p_start_date='" + sStarDate + "',p_end_date='" + sEndDate + "')/Set", {
                success: function (oData) {
                    var aResults = oData.results || [];
                    // Cache ONLY for Initial Date fetch request
                    if (this._initialScope.weekStartDate === sStarDate || this._initialScope.weekEndDate === sEndDate) {
                        this._defaultTableData = aResults.slice(); // clone
                    }
                    // Update table model
                    this.getOwnerComponent().getModel("oTableModel").setData(aResults);
                    this._prepareLocalData();
                    this.byId("idCategorizedPage").setBusy(false);
                }.bind(this),
                error: function () {
                    this.byId("idCategorizedPage").setBusy(false);
                    MessageBox.error("Failed to load data");
                }.bind(this)
            });
        },

        _prepareLocalData: function (aFilters) {
            var aAllData = this.getOwnerComponent().getModel("oTableModel").getData() || [];
            var fnPredicate = this._createPredicateFromFilters(aFilters);
            var aTableData = aAllData.filter(fnPredicate);
            /* ===============================
               Normalize BillDate → YYYY-MM-DD
               =============================== */
            function toDateKey(v) {
                if (!v) { return null; }
                var d = v instanceof Date ? v : new Date(v);
                return d.toISOString().slice(0, 10); // YYYY-MM-DD
            }
            /* ===============================
               Collect unique, sorted dates
               =============================== */
            var aDates = Array.from(new Set(aTableData.map(r => toDateKey(r.BillDate))))
                .filter(Boolean)
                .sort(); // chronological order
            /* ===============================
               Pivot maps
               =============================== */
            var mUsd = {};
            var mQty = {};
            aTableData.forEach(function (row) {
                var cat = row.ProductCategoryDesc;
                var date = toDateKey(row.BillDate);
                if (!cat || !date) { return; }

                var usd = Number(row.USDWtPrice) || 0;
                var qty = Number(row.SumOfQuantity) || 0;
                mUsd[cat] ??= { ProductCategory: cat, Total: 0 };
                mQty[cat] ??= { ProductCategory: cat, Total: 0 };

                mUsd[cat][date] = (mUsd[cat][date] || 0) + usd;
                mQty[cat][date] = (mQty[cat][date] || 0) + qty;

                mUsd[cat].Total += usd;
                mQty[cat].Total += qty;
            });
            /* ===============================
               Grand total rows
               =============================== */
            var oUsdTotal = { ProductCategory: "Grand Total", Total: 0 };
            var oQtyTotal = { ProductCategory: "Grand Total", Total: 0 };
            aDates.forEach(function (d) {
                oUsdTotal[d] = 0;
                oQtyTotal[d] = 0;
            });
            Object.values(mUsd).forEach(function (r) {
                aDates.forEach(d => oUsdTotal[d] += r[d] || 0);
                oUsdTotal.Total += r.Total;
            });
            Object.values(mQty).forEach(function (r) {
                aDates.forEach(d => oQtyTotal[d] += r[d] || 0);
                oQtyTotal.Total += r.Total;
            });
            /* ===============================
               Final UI model
               =============================== */
            var oTableData = {
                dates: aDates,                 // ["2025-12-18", "2025-12-19"]
                usdRows: [...Object.values(mUsd), oUsdTotal],
                qtyRows: [...Object.values(mQty), oQtyTotal]
            };
            // Create columns for both tables
            this._createTableColumns(this.byId("usdTable"), aDates, this.formatShortCurrency.bind(this), this.formatFullCurrency.bind(this));
            this._createTableColumns(this.byId("qtyTable"), aDates, this.formatShortNumber.bind(this), this.formatFullNumber.bind(this));
            // Set model data for both tables
            this.getView().getModel().setData(oTableData);
        },

        _createPredicateFromFilters: function (aFilters) {
            if (!aFilters || !aFilters.length) {
                return () => true;
            }
            function evalFilter(oFilter, row) {
                // Multi filter (AND / OR)
                if (oFilter.aFilters) {
                    if (oFilter.bAnd) {
                        return oFilter.aFilters.every(f => evalFilter(f, row));
                    } else {
                        return oFilter.aFilters.some(f => evalFilter(f, row));
                    }
                }
                var v = row[oFilter.sPath];
                var v1 = oFilter.oValue1;
                var v2 = oFilter.oValue2;

                switch (oFilter.sOperator) {
                    case FilterOperator.EQ: return v == v1;
                    case FilterOperator.NE: return v != v1;
                    case FilterOperator.GT: return v > v1;
                    case FilterOperator.GE: return v >= v1;
                    case FilterOperator.LT: return v < v1;
                    case FilterOperator.LE: return v <= v1;
                    case FilterOperator.BT: return v >= v1 && v <= v2;
                    default: return true;
                }
            }
            return function (row) {
                return aFilters.every(f => evalFilter(f, row));
            };
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

        _resetFilterData: function (oDate, oBusinessWeek) {
            // Reset filter model 
            this.getOwnerComponent().getModel("oFilterModel").setData({
                BillDate: oDate || new Date(),
                WeekStartDate: oBusinessWeek ? oBusinessWeek.weekStartDate : this._initialScope.weekStartDate,
                WeekEndDate: oBusinessWeek ? oBusinessWeek.weekEndDate : this._initialScope.weekEndDate,
                QtyFilters: {
                    USDWtPrice: { op: "EQ", v1: null, v2: null },
                    SumOfQuantity: { op: "EQ", v1: null, v2: null }
                }
            });
            // Clear MultiInput tokens
            this.getView().findAggregatedObjects(true, function (oCtrl) {
                return oCtrl.isA("sap.m.MultiInput");
            }).forEach(function (oMI) {
                oMI.removeAllTokens();
            });
        },

        _openValueHelpDialog: function (oInput, sField, sLabel) {
            // Store current input reference
            this._oActiveMultiInput = oInput;
            // Build VH data dynamically from current table data
            var aTableData = this.getOwnerComponent().getModel("oTableModel").getData();
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

        _getBusinessWeek: function (dateInput) {
            // Create date object
            var date = new Date(dateInput);
            // Month boundaries
            var monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            var monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            // JS weekday: Sunday=0 ... Saturday=6
            var day = date.getDay();
            // Convert to ISO weekday: Monday=1 ... Sunday=7
            var isoDay = (day === 0) ? 7 : day;
            // Calculate previous (or same) Thursday offset
            // Thursday=4 → ensures Thursday <= given date
            var diffToThursday = (isoDay + 3) % 7;
            // Calculate Thursday (week start)
            var weekStart = new Date(date);
            weekStart.setDate(date.getDate() - diffToThursday);
            // Calculate Wednesday (week end)
            var weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            // Clip to month start
            if (weekStart < monthStart) { weekStart = new Date(monthStart); }
            // Clip to month end
            if (weekEnd > monthEnd) { weekEnd = new Date(monthEnd); }
            // Return YYYYMMDD strings
            return {
                weekStartDate: this._formatYYYYMMDD(weekStart),
                weekEndDate: this._formatYYYYMMDD(weekEnd)
            }
        },

        _formatYYYYMMDD: function (oDate) {
            const year = oDate.getFullYear();
            const month = String(oDate.getMonth() + 1).padStart(2, "0");
            const day = String(oDate.getDate()).padStart(2, "0");
            return `${year}${month}${day}`;
        },

        // ------------------------------------------------
        // Create dynamic columns with multi-level headers
        // ------------------------------------------------
        _createTableColumns: function (oTable, aDates, fnFormatter1, fnFormatter2) {
            /* ===============================
                 Remove previously added dynamic columns
                =============================== */
            var aColumns = oTable.getColumns();

            // Start from the LAST column and stop at index 1
            for (var i = aColumns.length - 1; i >= 1; i--) {
                oTable.removeColumn(aColumns[i]);
                aColumns[i].destroy();
            }
            // -------- Bill Date columns --------
            var that = this;
            aDates.forEach(function (sDate, iIndex) {
                oTable.addColumn(new Column({
                    multiLabels: [
                        new Label({ text: iIndex === 0 ? "Bill Date" : "" }),
                        new Label({ text: sDate })
                    ],
                    template: new Text({
                        text: {
                            path: sDate,
                            formatter: fnFormatter1
                        },
                        tooltip: {
                            path: sDate,
                            formatter: fnFormatter2
                        }
                    }),
                    hAlign: "End"
                }));
            });

            // -------- Grand Total column --------
            oTable.addColumn(new Column({
                multiLabels: [
                    new Label({ text: "" }),
                    new Label({ text: "Grand Total" })
                ],
                template: new Text({
                    text: {
                        path: "Total",
                        formatter: fnFormatter1
                    },
                    tooltip: {
                        path: "Total",
                        formatter: fnFormatter2
                    }
                }),
                hAlign: "End"
            }));
        },

        /* ===========================
        * Export
        * =========================== */
        onExportExcel: function () {
            var oModel = this.getView().getModel();
            var aDates = oModel.getProperty("/dates") || [];
            var aUsdRows = oModel.getProperty("/usdRows") || [];
            var aQtyRows = oModel.getProperty("/qtyRows") || [];
            var aColumns = this._createDynamicColumns(aDates);

            // -------- Export USD Value --------
            this._exportSingleSheet(
                "WeeklySales_USD_Value.xlsx",
                "Weekly Sales USD",
                aColumns,
                aUsdRows
            );

            // -------- Export Quantity --------
            this._exportSingleSheet(
                "WeeklySales_Quantity.xlsx",
                "Weekly Saled Quantity",
                aColumns,
                aQtyRows
            );
        },

        _exportSingleSheet: function (sFileName, sSheetName, aColumns, aData) {
            var oSheet = new Spreadsheet({
                workbook: {
                    columns: aColumns, context: {
                        sheetName: sSheetName
                    }
                },
                dataSource: aData,   // single-sheet API
                fileName: sFileName
            });
            oSheet.build()
                .then(function () { oSheet.destroy(); })
                .catch(function (err) { sap.m.MessageBox.error("Export failed: " + err); });
        },

        _createDynamicColumns: function (aDates) {
            var aColumns = [];

            // Product Category
            aColumns.push({
                label: "Product Category",
                property: "ProductCategory",
                type: "string"
            });

            // Dynamic Bill Date columns
            aDates.forEach(function (sDate) {
                aColumns.push({
                    label: sDate,
                    property: sDate,
                    type: "number"
                });
            });

            // Grand Total
            aColumns.push({
                label: "Grand Total",
                property: "Total",
                type: "number"
            });
            return aColumns;
        },

        /* ===========================
         * Side content toggle
         * =========================== */
        onToggleSideContent: function () {
            var oDSC = this.byId("idCategorizedDsc");
            var bShow = oDSC.getShowSideContent();
            var oBtnMain = this.byId("idCategorizedBtnToggleMain");
            oBtnMain.setVisible(true);
            oDSC.setShowSideContent(!bShow);
        },

        onToggleMainContent: function () {
            var oDSC = this.byId("idCategorizedDsc");
            var bShow = oDSC.getShowSideContent();
            var oBtnMain = this.byId("idCategorizedBtnToggleMain");
            oDSC.setShowSideContent(!bShow);
            oBtnMain.setVisible(false);
        },

        /* ===========================
         * Formatters
         * =========================== */
        formatDate: function (v) {
            if (!v) return "";
            try {
                var d;
                // Case 1: already a Date
                if (v instanceof Date) {
                    d = v;
                }
                // Case 2: YYYYMMDD string
                else if (typeof v === "string" && /^\d{8}$/.test(v)) {
                    d = new Date(
                        Number(v.slice(0, 4)),        // year
                        Number(v.slice(4, 6)) - 1,    // month (0-based)
                        Number(v.slice(6, 8))         // day
                    );
                }
                // Case 3: everything else
                else {
                    d = new Date(v);
                }
                if (isNaN(d.getTime())) return v;
                return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
            } catch (e) { return v; }
        },

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