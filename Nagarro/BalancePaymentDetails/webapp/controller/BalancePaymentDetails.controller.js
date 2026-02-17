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

    return Controller.extend("zbalancepaymentdetails.controller.BalancePaymentDetails", {
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
                    AmountFilters: {
                        AdvanceAmount: { op: "EQ", v1: null, v2: null },
                        LCAmount: { op: "EQ", v1: null, v2: null },
                    }
                }), "oFilterModel");
            this.getView().setModel(new JSONModel({ visible: true }), "toggleNetBalance");

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
            var oTable = this.byId("idBalancePaymentTable");
            var oBinding = oTable.getBinding("items");
            var aFilters = [];
            var oData = oFilterModel.getData() || {};

            /* ===============================
               1. MultiInput token filters
               =============================== */
            this._addMultiInputFilter(aFilters, "CustomerCode");
            this._addMultiInputFilter(aFilters, "CompanyCode");
            this._addMultiInputFilter(aFilters, "CustomerName");
            this._addMultiInputFilter(aFilters, "NetBalanceIndicator");

            /* ===============================
               2. Amount filters (generic loop)
               =============================== */
            var oAmtFilters = oData.AmountFilters || {};
            Object.keys(oAmtFilters).forEach(function (sField) {
                var oF = oAmtFilters[sField];
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
            this.byId("page").setBusy(true);
            this.getOwnerComponent().getModel().read("/ZSD_BALANCE_PAYMENT_DETAIL(p_year='" + sYear + "',p_month='" + sMonth + "')/Set", {
                success: function (oData) {
                    var aResults = oData.results || [];
                    // Cache ONLY for Initial Date fetch request
                    if (this._initialScope.year === sYear || this._initialScope.month === sMonth) {
                        this._defaultTableData = aResults.slice(); // clone
                    }
                    // Update table model
                    this.getView().getModel("oTableModel").setData(aResults);
                    this.byId("page").setBusy(false);
                }.bind(this),
                error: function () {
                    this.byId("page").setBusy(false);
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
                AmountFilters: {
                    AdvanceAmount: { op: "EQ", v1: null, v2: null },
                    LCAmount: { op: "EQ", v1: null, v2: null },
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
            this.byId("idBalancePaymentTable").getBinding("items").filter([]);
            // Clear Sorting
            this._clearSort();
            // Restore first fetch snapshot
            this.getView().getModel("oTableModel").setData(this._defaultTableData.slice());
        },

        _openValueHelpDialog: function (oInput, sField, sLabel) {
            // Store current input reference
            this._oActiveMultiInput = oInput;
            // Build VH data dynamically from current table data
            var oBinding = this.byId("idBalancePaymentTable").getBinding("items");
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
            var oBinding = this.byId("idBalancePaymentTable").getBinding("items");
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
                        sheetName: "Balance Payment Details"
                    }
                },
                dataSource: aData,
                fileName: "BalancePaymentDetails.xlsx"
            });
            oSheet.build()
                .then(function () { oSheet.destroy(); })
                .catch(function (err) { MessageBox.error("Export failed: " + err); });
        },

        _createColumnConfig: function () {
            if (this.byId("idNetBalanceAdvanced").getVisible()) {
                var oColumn = { label: "Net Balance Amount (Advanced Amount)", property: "NetBalanceAdvanced", type: "number" };
            } else {
                oColumn = { label: "Net Balance Amount (LC)", property: "NetBalanceLC", type: "number" };
            }
            return [
                { label: "Year", property: "Year", type: "number" },
                { label: "Month", property: "Month", type: "string" },
                { label: "Customer Code", property: "CustomerCode", type: "string" },
                { label: "Company Code", property: "CompanyCode", type: "string" },
                { label: "Customer Name", property: "CustomerName", type: "string" },
                { label: "Net Balance (Debit/Credit)", property: "NetBalance", type: "string" },
                oColumn
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

        onToggleNetBalance: function () {
            var bVisible = this.getView().getModel("toggleNetBalance").getProperty("/visible");
            if (bVisible) {
                this.getView().getModel("toggleNetBalance").setProperty("/visible", false);
            } else {
                this.getView().getModel("toggleNetBalance").setProperty("/visible", true);
            }
        },

        /* ===========================
         * Sort actions (wired to toolbar Sort button)
         * =========================== */
        onOpenSortDialog: function (oEvent) {
            var bVisible = this.byId("idNetBalanceAdvanced").getVisible();
            if (bVisible) {
                var oViewSettingsItem = new ViewSettingsItem({ text: "Net Balance Amount (Advanced Amount)", key: "NetBalanceAdvanced" });
                var sField = "NetBalanceAdvanced";
            } else {
                oViewSettingsItem = new ViewSettingsItem({ text: "Net Balance Amount (LC)", key: "NetBalanceLC" });
                sField = "NetBalanceLC";
            }
            var that = this;
            this._oSortSheet = new ActionSheet({
                placement: "Bottom",
                buttons: [
                    new Button({
                        text: "Sort All Ascending",
                        icon: "sap-icon://sort-ascending",
                        press: function () { that._applySortAll(false, sField); }
                    }),
                    new Button({
                        text: "Sort All Descending",
                        icon: "sap-icon://sort-descending",
                        press: function () { that._applySortAll(true, sField); }
                    }),
                    new Button({
                        text: "Custom Sort…",
                        icon: "sap-icon://action-settings",
                        press: function () { that._openCustomSort(oViewSettingsItem); }
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
            var oSource = oEvent && oEvent.getSource ? oEvent.getSource() : this.byId("btnSort");
            this._oSortSheet.openBy(oSource);
        },

        _applySortAll: function (bDescending, sField) {
            var aFieldsInOrder = [
                "Year", "Month", "CustomerCode", "CompanyCode", "CustomerName", "NetBalance", sField
            ];
            var aSorters = aFieldsInOrder.map(function (sPath) {
                return new Sorter(sPath, bDescending);
            });
            var oBinding = this.byId("idBalancePaymentTable").getBinding("items");
            if (oBinding) {
                oBinding.sort(aSorters);
            }
        },

        _openCustomSort: function (oViewSettingsItem) {
            var that = this;
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
                new ViewSettingsItem({ text: "Month", key: "Month" }),
                new ViewSettingsItem({ text: "Customer Code", key: "CustomerCode" }),
                new ViewSettingsItem({ text: "Company Code", key: "CompanyCode" }),
                new ViewSettingsItem({ text: "Customer Name", key: "CustomerName" }),
                new ViewSettingsItem({ text: "Net Balance (Debit/Credit)", key: "NetBalance" }),
                oViewSettingsItem
            ].forEach(function (o) { that._oVSD.addSortItem(o); });
            this.getView().addDependent(this._oVSD);
            this._oVSD.open();
        },

        _applySingleSort: function (sPath, bDescending) {
            var oBinding = this.byId("idBalancePaymentTable").getBinding("items");
            if (oBinding) oBinding.sort([new Sorter(sPath, bDescending)]);
        },

        _clearSort: function () {
            var oBinding = this.byId("idBalancePaymentTable").getBinding("items");
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
                    name: "zbalancepaymentdetails.view.fragments.ColumnSettings",
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
            var oTable = this.byId("idBalancePaymentTable");
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
            var oTable = this.byId("idBalancePaymentTable");
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
        formatShortCurrency: function (v) {
            var n = Number(v);
            if (!isFinite(n)) return "";
            return this._toShort(n, 2);
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
