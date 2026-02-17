sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Filter",
    "sap/m/SearchField",
    "sap/ui/core/Fragment",
    "sap/ui/table/Column",
], (Controller, JSONModel, MessageBox, FilterOperator, Filter, SearchField, Fragment, UIColumn) => {
    "use strict";

    return Controller.extend("zgatepass.controller.GatePassHome", {
        onInit() {
            this.getView().setModel(new JSONModel(), "gatePassHome");
        },

        onCreate: function () {
            var oGatePassData = this.getView().getModel("gatePassHome").getData();
            this._checkAuthorization("CREATEGP", "Create", oGatePassData);
        },

        onDisplay: function () {
            var oGatePassData = this.getView().getModel("gatePassHome").getData();
            this._checkAuthorization("DISPLAYGP", "Display", oGatePassData);
        },

        /*---------------------------------< Helper functions > ----------------------------------*/
        _filterArray: function (oEvent) {
            // Creating Filter Array from FilterBar SelectionSet
            var aSelectionSet = oEvent.getParameter("selectionSet");
            var aFilters = aSelectionSet.reduce(function (aResult, oControl) {
                if (oControl.getValue()) {
                    aResult.push(new Filter({
                        path: oControl.getName(),
                        operator: FilterOperator.Contains,
                        value1: oControl.getValue()
                    }));
                }
                return aResult;
            }, []);
            return aFilters;
        },

        _filterVHTable: function (oFilter, oVHD) {
            oVHD.getTableAsync().then(function (oTable) {
                if (oTable.bindRows) {
                    oTable.getBinding("rows").filter(oFilter, "Application");
                }
                if (oTable.bindItems) {
                    oTable.getBinding("items").filter(oFilter, "Application");
                }
                oVHD.update();
            });
        },

        _checkAuthorization: function (sApplicaitonType, sAction, oGatePassData) {
            // Get the model
            var oModel = this.getView().getModel();

            // Use createKey to build the path safely
            // "UserRoleSet" is the EntitySet name; the object contains key properties
            var sPath = "/" + oModel.createKey("UserRoleSet", {
                Application: sApplicaitonType,
                Plant: oGatePassData.plant
            });

            var that = this;
            // Resulting sPath will be "/Products('1001')"
            oModel.read(sPath, {
                success: function (oData) {
                    if (oData.Authorized === 'N') {
                        MessageBox.error(`${oData.Message}. You are not authorized to use Plant: ${oGatePassData.plant}.`);
                    } else {
                        that._navigateToExternal(sAction, oGatePassData);
                    }
                },
                error: function (oError) {
                    MessageBox.error(oError);
                }
            });
        },

        _navigateToExternal: function (sAction, oGatePassData) {
            if (!oGatePassData.plant || !oGatePassData.gpType) {
                MessageBox.error("Fill out all required entry fields");
                return;
            }
            if (sAction === "Display" && (!oGatePassData.gpDate || !oGatePassData.gpNo)) {
                MessageBox.warning("Please enter all fields");
                return;
            }
            var oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");
            // Generate the hash for the target application with parameters
            var hash = (oCrossAppNavigator && oCrossAppNavigator.hrefForExternal({
                target: {
                    semanticObject: "ZGATE_PASS_MANAGE", // Replace with your target app's semantic object
                    action: "manage" // Replace with your target app's action
                },
                params: {
                    // Pass data as parameters
                    "GPNo": oGatePassData.gpNo || "",
                    "Plant": oGatePassData.plant || "",
                    "GPDate": oGatePassData.gpDate || "",
                    "GPType": oGatePassData.gpType || "",
                    "Editable": sAction
                }
            })) || "";

            // Navigate to the target application
            oCrossAppNavigator.toExternal({
                target: {
                    shellHash: hash
                }
            });
        },

        /*-------------------------------------< Value Helps > -----------------------------------*/
        /*-------------------------------< Begin of Plant Value Help > ---------------------------*/
        onPlantVHRequest: function () {
            if (!this.plantVHDialog) {
                this.plantVHDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "zgatepass.view.fragment.PlantVH",
                    controller: this
                });
            }
            this.plantVHDialog.then(function (oDialogPlantVH) {
                this._oVHDplant = oDialogPlantVH;
                // Initialise the dialog with model only the first time. Then only open it
                if (this._bDialogInitializedPlant) {
                    oDialogPlantVH.setTokens([]);
                    oDialogPlantVH.update();
                    oDialogPlantVH.open();
                    return;
                }
                this.getView().addDependent(oDialogPlantVH);
                oDialogPlantVH.getTableAsync().then(function (oTable) {
                    if (oTable.bindRows) {
                        // Bind rows to the ODataModel and add columns
                        oTable.bindAggregation("rows", {
                            path: "/PlantSHSet",
                            templateShareable: false,
                            events: {
                                dataReceived: function () {
                                    oDialogPlantVH.update();
                                }
                            }
                        });
                        oTable.addColumn(new UIColumn({ label: "Plant", template: "Werks" }));
                        oTable.addColumn(new UIColumn({ label: "Name", template: "Name1" }));
                        oTable.addColumn(new UIColumn({ label: "Search Term 2", template: "Sort2" }));
                        oTable.addColumn(new UIColumn({ label: "Search Term 1", template: "Sort1" }));
                        oTable.addColumn(new UIColumn({ label: "Postal Code", template: "PostCode1" }));
                        oTable.addColumn(new UIColumn({ label: "City", template: "City1" }));
                        oTable.addColumn(new UIColumn({ label: "Name 2", template: "Name2" }));
                        oTable.addColumn(new UIColumn({ label: "Version", template: "Nation" }));
                    }
                    oDialogPlantVH.update();
                }.bind(this));
                // set flag that the dialog is initialized
                this._bDialogInitializedPlant = true;
                oDialogPlantVH.open();
            }.bind(this));
        },

        onPlantVHOkPress: function (oEvent) {
            var aTokens = oEvent.getParameter("tokens");
            if (aTokens && aTokens.length > 0) {
                this.byId("idPlant").setValue(aTokens[0].getAggregation("customData")[0].getValue().Werks);
            }
            this._oVHDplant.close();
        },

        onPlantVHCancelPress: function () {
            this._oVHDplant.close();
        },

        onPlantVHFilterBarSearch: function (oEvent) {
            // Creating Filter Array from FilterBar SelectionSet
            var aFilters = this._filterArray(oEvent);
            var oVHDplant = this._oVHDplant;
            this._filterVHTable(aFilters, oVHDplant);
        },
        /*--------------------------------< End of Plant Value Help > ----------------------------*/

        /*-------------------------------< Begin of GP Type Value Help > -------------------------*/
        onGPTypeVHRequest: function () {
            if (!this.GPTypeVHDialog) {
                this.GPTypeVHDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "zgatepass.view.fragment.GPTypeVH",
                    controller: this
                });
            }
            this.GPTypeVHDialog.then(function (oDialogGPTypeVH) {
                this._oVHDGPType = oDialogGPTypeVH;
                // Initialise the dialog with model only the first time. Then only open it
                if (this._bDialogInitializedGPType) {
                    oDialogGPTypeVH.setTokens([]);
                    oDialogGPTypeVH.update();
                    oDialogGPTypeVH.open();
                    return;
                }
                this.getView().addDependent(oDialogGPTypeVH);
                oDialogGPTypeVH.getTableAsync().then(function (oTable) {
                    if (oTable.bindRows) {
                        // Bind rows to the ODataModel and add columns
                        oTable.bindAggregation("rows", {
                            path: "/GPTypeSHSet",
                            templateShareable: false,
                            events: {
                                dataReceived: function () {
                                    oDialogGPTypeVH.update();
                                }
                            }
                        });
                        oTable.addColumn(new UIColumn({ label: "GP Type", template: "GatePassType" }));
                        oTable.addColumn(new UIColumn({ label: "Short Description", template: "Description" }));
                    }
                    oDialogGPTypeVH.update();
                }.bind(this));
                // set flag that the dialog is initialized
                this._bDialogInitializedGPType = true;
                oDialogGPTypeVH.open();
            }.bind(this));
        },

        onGPTypeVHOkPress: function (oEvent) {
            var aTokens = oEvent.getParameter("tokens");
            if (aTokens && aTokens.length > 0) {
                this.byId("idGPType").setValue(aTokens[0].getAggregation("customData")[0].getValue().GatePassType);
            }
            this._oVHDGPType.close();
        },

        onGPTypeVHCancelPress: function () {
            this._oVHDGPType.close();
        },

        onGPTypeVHFilterBarSearch: function (oEvent) {
            // Creating Filter Array from FilterBar SelectionSet
            var aFilters = this._filterArray(oEvent);
            var oVHDGPType = this._oVHDGPType;
            this._filterVHTable(aFilters, oVHDGPType);
        },
        /*--------------------------------< End of GP Type Value Help > --------------------------*/

        /*-------------------------------< Begin of GP Numner Value Help > -----------------------*/
        onGPNoVHRequest: function () {
            if (!this.GPNoVHDialog) {
                this.GPNoVHDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "zgatepass.view.fragment.GPNoVH",
                    controller: this
                });
            }
            this.GPNoVHDialog.then(function (oDialogGPNoVH) {
                this._oVHDGPNo = oDialogGPNoVH;
                // Prepare Default filters for GP Number
                var oData = this.getView().getModel("gatePassHome").getData();
                var aFilters = [];
                /* ----Check for Plant filter ---- */
                if (oData.plant) {
                    aFilters.push(new Filter("ZWerks", FilterOperator.Contains, oData.plant));
                    this.byId("idGPNoPlant").setValue(oData.plant);
                }
                /* ---- Check for GP Type filter ---- */
                if (oData.gpType) {
                    aFilters.push(new Filter("ZGptyp", FilterOperator.Contains, oData.gpType));
                    this.byId("idGPNoType").setValue(oData.gpType);
                }
                /* ---- Check for GP Date filter ---- */
                if (oData.gpDate) {
                    var gpDate = new Date(parseInt(oData.gpDate.substring(0, 4), 10),      // year → 2025
                        parseInt(oData.gpDate.substring(4, 6), 10) - 1,  // month → 11 (0-based)
                        parseInt(oData.gpDate.substring(6, 8), 10));     // day → 31
                    aFilters.push(new Filter("ZGpdat", FilterOperator.EQ, gpDate));
                    this.byId("idGPNoDate").setValue(oData.gpDate);
                } else {
                    this.byId("idGPNoDate").setValue();
                }
                if (aFilters.length > 0) {
                    var oFilter = new Filter({ filters: aFilters, and: true });
                }
                // Initialise the dialog with model only the first time. Then only open it
                if (this._bDialogInitializedGPNo) {
                    oDialogGPNoVH.setTokens([]);
                    this._filterVHTable(oFilter, oDialogGPNoVH)
                    oDialogGPNoVH.update();
                    oDialogGPNoVH.open();
                    return;
                }
                this.getView().addDependent(oDialogGPNoVH);
                oDialogGPNoVH.getTableAsync().then(function (oTable) {
                    if (oTable.bindRows) {
                        // Bind rows to the ODataModel and add columns
                        oTable.bindAggregation("rows", {
                            path: "/GPNoSHSet",
                            templateShareable: false,
                            filters: oFilter ? [oFilter] : null,
                            events: {
                                dataReceived: function () {
                                    oDialogGPNoVH.update();
                                }
                            }
                        });
                        oTable.addColumn(new UIColumn({ label: "Plant", template: "ZWerks" }));
                        oTable.addColumn(new UIColumn({ label: "GP No", template: "ZGpno" }));
                        oTable.addColumn(new UIColumn({ label: "GP Type", template: "ZGptyp" }));
                        oTable.addColumn(new UIColumn({ label: "GP Date", template: "ZGpdat" }));
                    }
                    oDialogGPNoVH.update();
                }.bind(this));
                // set flag that the dialog is initialized
                this._bDialogInitializedGPNo = true;
                oDialogGPNoVH.open();
            }.bind(this));
        },

        onGPNoVHOkPress: function (oEvent) {
            var aTokens = oEvent.getParameter("tokens");
            if (aTokens && aTokens.length > 0) {
                var oSelectedRow = aTokens[0].getAggregation("customData")[0].getValue();
                var oData = {
                    plant: oSelectedRow.ZWerks,
                    gpType: oSelectedRow.ZGptyp,
                    gpDate: oSelectedRow.ZGpdat,
                    gpNo: oSelectedRow.ZGpno
                };
                this.getView().getModel("gatePassHome").setData(oData);
            }
            this._oVHDGPNo.close();
        },

        onGPNoVHCancelPress: function () {
            this._oVHDGPNo.close();
        },

        onGPNoVHFilterBarSearch: function (oEvent) {
            // Creating Filter Array from FilterBar SelectionSet
            var aFilters = this._filterArray(oEvent);
            var oVHDGPNo = this._oVHDGPNo;
            this._filterVHTable(aFilters, oVHDGPNo);
        }
        /*--------------------------------< End of GP Number Value Help > ------------------------*/
    });
});