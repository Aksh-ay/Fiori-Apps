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
    "sap/ui/core/CustomData",
    "sap/m/Token",
    "sap/m/ActionSheet",
    "sap/m/Button",
    "sap/ui/core/format/NumberFormat"
], (Controller, JSONModel, Spreadsheet, MessageBox, ViewSettingsDialog, ViewSettingsItem,
    Sorter, Filter, FilterOperator, FilterType, SelectDialog, StandardListItem, CustomData, Token, ActionSheet, Button, NumberFormat) => {
    "use strict";

    return Controller.extend("zsd_sales_week.controller.Overview", {
        /* ===========================
         * Lifecycle
         * =========================== */
        onInit: function () {
            // Hide side content initially
            var oDSC = this.byId("dsc");
            oDSC && oDSC.setShowSideContent(false);

            // Initial scope - Execution Date (store once)
            this._initialScope = this._getBusinessWeek(new Date());
            this._defaultTableData = [];

            // View / Filter / Table models
            this.getOwnerComponent().getModel("oFilterModel").setData({
                BillDate: new Date(),
                WeekStartDate: this._initialScope.weekStartDate,
                WeekEndDate: this._initialScope.weekEndDate,
                QtyFilters: {
                    USDWtPrice: { op: "EQ", v1: null, v2: null },
                    SumOfQuantity: { op: "EQ", v1: null, v2: null }
                }
            });

            // Initial fetch
            this._fetchTableData(this._initialScope.weekStartDate, this._initialScope.weekEndDate);
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
            var oFilterModel = this.getOwnerComponent().getModel("oFilterModel");
            var oTable = this.byId("idWeeklySalesTable");
            var oBinding = oTable.getBinding("items");
            var aFilters = [];
            var oData = oFilterModel.getData() || {};

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

            /* ===============================
               3. Apply filters to table
               =============================== */
            oBinding.filter(aFilters, FilterType.Application);
        },

        onResetFilters: function () {
            this._resetFilterData();
            // Restore first fetch snapshot
            this.getOwnerComponent().getModel("oTableModel").setData(this._defaultTableData.slice());
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
            this.byId("idOverviewPage").setBusy(true);
            this.getOwnerComponent().getModel().read("/ZSD_DAY_WEEK_SALES(p_start_date='" + sStarDate + "',p_end_date='" + sEndDate + "')/Set", {
                success: function (oData) {
                    var aResults = oData.results || [];
                    // Cache ONLY for Initial Date fetch request
                    if (this._initialScope.weekStartDate === sStarDate || this._initialScope.weekEndDate === sEndDate) {
                        this._defaultTableData = aResults.slice(); // clone
                    }
                    // Update table model
                    this.getOwnerComponent().getModel("oTableModel").setData(aResults);
                    this._applySingleSort("BillDate", false);
                    this.byId("idOverviewPage").setBusy(false);
                }.bind(this),
                error: function () {
                    this.byId("idOverviewPage").setBusy(false);
                    MessageBox.error("Failed to load data");
                }.bind(this)
            });
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
            // Clear binding filters
            this.byId("idWeeklySalesTable").getBinding("items").filter([]);
            // Clear Sorting
            this._clearSort();
        },

        _openValueHelpDialog: function (oInput, sField, sLabel) {
            // Store current input reference
            this._oActiveMultiInput = oInput;
            // Build VH data dynamically from current table data
            var oBinding = this.byId("idWeeklySalesTable").getBinding("items");
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
            var oInput = this._oActiveMultiInput; // ✅ correct input
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

        /* ===========================
         * Export
         * =========================== */
        onExportExcel: function () {
            var oBinding = this.byId("idWeeklySalesTable").getBinding("items");
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
                        sheetName: "Overview Weekly Sales"
                    }
                },
                dataSource: aData,
                fileName: "RollOverQuantity.xlsx"
            });

            oSheet.build()
                .then(function () { oSheet.destroy(); })
                .catch(function (err) { MessageBox.error("Export failed: " + err); });
        },

        _createColumnConfig: function () {
            return [
                { label: "Year", property: "BillingYear", type: "string" },
                { label: "Month", property: "BillingMonth", type: "string" },
                { label: "Bill Date", property: "BillDate", type: "date" },
                { label: "Contract No", property: "ContractNo", type: "string" },
                { label: "Sales Order No", property: "SalesOrderNo", type: "string" },
                { label: "Product Category", property: "ProductCategoryDesc", type: "string" },
                { label: "Sold to Party", property: "SoldtoParty", type: "string" },
                { label: "Ship to Party", property: "ShiptoParty", type: "string" },
                { label: "Ship to Party Name", property: "ShipToPartyName", type: "string" },
                { label: "USD_Wt_Price", property: "USDWtPrice", type: "string" },
                { label: "Sum of Quantity", property: "SumOfQuantity", type: "string" }
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
                "BillingYear", "BillingMonth", "BillDate", "ContractNo", "SalesOrderNo", "ProductCategoryDesc",
                "SoldToParty", "ShipToParty", "ShipToPartyName", "USDWtPrice", "SumOfQuantity"
            ];
            var aSorters = aFieldsInOrder.map(function (sPath) {
                return new Sorter(sPath, bDescending);
            });
            var oBinding = this.byId("idWeeklySalesTable").getBinding("items");
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
                    new ViewSettingsItem({ text: "Year", key: "BillingYear" }),
                    new ViewSettingsItem({ text: "Month", key: "BillingMonth" }),
                    new ViewSettingsItem({ text: "Bill Date", key: "BillDate" }),
                    new ViewSettingsItem({ text: "ContractNo", key: "ContractNo" }),
                    new ViewSettingsItem({ text: "Sales Order No", key: "SalesOrderNo" }),
                    new ViewSettingsItem({ text: "Product Category", key: "ProductCategoryDesc" }),
                    new ViewSettingsItem({ text: "Sold to Party", key: "SoldToParty" }),
                    new ViewSettingsItem({ text: "Ship to Party", key: "ShipToParty" }),
                    new ViewSettingsItem({ text: "Ship to Party Name", key: "ShipToPartyName" }),
                    new ViewSettingsItem({ text: "USD_Wt_Price", key: "USDWtPrice" }),
                    new ViewSettingsItem({ text: "Sum of Quantity", key: "SumOfQuantity" })
                ].forEach(function (o) { that._oVSD.addSortItem(o); });
                this.getView().addDependent(this._oVSD);
            }
            this._oVSD.open();
        },

        _applySingleSort: function (sPath, bDescending) {
            var oBinding = this.byId("idWeeklySalesTable").getBinding("items");
            if (oBinding) oBinding.sort([new Sorter(sPath, bDescending)]);
        },

        _clearSort: function () {
            var oBinding = this.byId("idWeeklySalesTable").getBinding("items");
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
                    name: "zsd_sales_week.view.fragments.ColumnSettings",
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
            var oTable = this.byId("idWeeklySalesTable");
            var aColumns = oTable.getColumns();
            var oList = sap.ui.getCore().byId("fieldList");
            oList.removeAllItems();
            aColumns.forEach(function (oColumn, iIndex) {
                oList.addItem(
                    new StandardListItem({
                        title: oColumn.getHeader().getText(),
                        selected: oColumn.getVisible(),
                        customData: [
                            new CustomData({
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
            sap.ui.getCore().byId("fieldCounterTitle").setText("Field (" + iSelected + "/" + iTotal + ")");
            sap.ui.getCore().byId("clearAllBtn").setEnabled(iSelected > 0);
        },

        onUnselectAll: function () {
            var oList = sap.ui.getCore().byId("fieldList");
            oList.removeSelections(true);
            this.updateFieldCounter();
        },

        onFieldConfirm: function () {
            var oTable = this.byId("idWeeklySalesTable");
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
