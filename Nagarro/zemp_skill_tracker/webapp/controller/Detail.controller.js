sap.ui.define([
	"./BaseController",
	"sap/m/library",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseController, mobileLibrary, JSONModel, MessageToast, MessageBox) {
	"use strict";

	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;

	return BaseController.extend("sap.ui.demo.orderbrowser.controller.Detail", {

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function () {
			this._oSkillsSmartTable = this.byId("skillsSmartTable");
			this._oCertificationSmartTable = this.byId("certificationsSmartTable");
			// set editView model for the Detail view
			this.setModel(new JSONModel({ editable: false }), "editView");
			this.getRouter().getRoute("detail").attachPatternMatched(this._onObjectMatched, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Toggle between Edit and Display Mode
		 * @public
		 */
		onEditPress: function () {
			this.getView().getModel("editView").setProperty("/editable", true);
			// Navigate to Skills subsection
			var oObjectPageLayout = this.byId("objectPageLayout");
			var oTargetSubSection = this.byId("skillsSubsection");
			if (oObjectPageLayout && oTargetSubSection) {
				oObjectPageLayout.setSelectedSection(oTargetSubSection);
			}
			this._oSkillsSmartTable.getTable().setMode(sap.m.ListMode.MultiSelect);
			this._oCertificationSmartTable.getTable().setMode(sap.m.ListMode.MultiSelect);
		},

		onCreatePress: function (oEvent) {
			var oInnerTable = oEvent.getSource().getParent().getParent().getTable();
			var oListBinding = oInnerTable.getBinding("items");
			var sEmployeeId = oEvent.getSource().getBindingContext().getObject().EmployeeUUID;

			// create NEW row directly in the table's listbinding
			var oContext = oListBinding.create({
				EmployeeId: sEmployeeId
			}, true);

			// clear previous selection
			oInnerTable.removeSelections();
			// find the list item whose binding context matches
			oInnerTable.getItems().forEach(function (oItem) {
				if (oItem.getBindingContext().getPath() === oContext.getPath()) {
					oInnerTable.setSelectedItem(oItem, true);
				}
			});
			MessageToast.show("New row added (not saved yet). Click Save to commit.");
		},

		onDeletePress: function (oEvent) {
			// Delete the selected row (or rows)
			var oInnerTable = oEvent.getSource().getParent().getParent().getTable(),
				aDeletedContexts = oInnerTable.getSelectedContexts();

			if (!aDeletedContexts || aDeletedContexts.length === 0) {
				MessageToast.show("Select row(s) to delete.");
				return;
			}

			// Ask confirmation (optional)
			MessageBox.confirm("Delete selected row(s)? This will be applied on Save.", {
				onClose: function (sAction) {
					if (sAction !== MessageBox.Action.OK) { return; }

					aDeletedContexts.forEach(function (oContext) {
						oContext.delete();
						// find the list item whose binding context matches
						oInnerTable.getItems().forEach(function (oItem) {
							if (oItem.getBindingContext().getPath() === oContext.getPath()) {
								oItem.setVisible(false);
							}
						});
					}.bind(this));
					MessageToast.show("Delete queued (will be sent on Save).");
				}.bind(this)
			});
		},

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress: function () {
			var sEmail = this.getView().getBindingContext().getObject().EmailId;
			URLHelper.triggerEmail(sEmail);
		},

		/**
		 * Event handler when the Resume Url is clicked
		 * @public
		 */
		onResumePress: function (oLink) {
			URLHelper.redirect("https://" + oLink.getSource().getText(), true);
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this._discardChanges();
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getRouter().navTo("master");
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		ontoggleFullScreenPress: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		},

		onSavePress: function () {
			// Submit all deferred groups (the model will send a single batch for the group).
			var that = this;
			this.getModel().submitChanges({
				success: function (oData, response) {
					// oData.__batchResponses contains details of batch result
					// switch to Display mode
					that._discardChanges(true);
					that._oSkillsSmartTable.rebindTable();
					that._oCertificationSmartTable.rebindTable();
				},
				error: function (oErr) {
					if (oErr) {
						MessageBox.error(oErr.responseText);
					}
					// switch to Display mode
					that._discardChanges();
					that._oSkillsSmartTable.rebindTable();					
					that._oCertificationSmartTable.rebindTable();
				}
			});
		},

		/**
		 * Toggle between Edit and Display Mode
		 * @public
		 */
		onCancelPress: function () {
			this._discardChanges();
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_discardChanges: function (bSuccess) {
			this.getView().getModel("editView").setProperty("/editable", false);
			// Discard all pending changes 
			this.getModel().resetChanges(null, true, true);

			// Refresh the SmartTable's binding so transient entries removed are reflected.
			this._oSkillsSmartTable.getTable().setMode(sap.m.ListMode.None)
				.getItems().forEach(function (oItem) {
					oItem.setVisible(true);
				});
			this._oCertificationSmartTable.getTable().setMode(sap.m.ListMode.None)
				.getItems().forEach(function (oItem) {
					oItem.setVisible(true);
				});
			if (bSuccess) {
				MessageToast.show("Saved successfully.");
			} else {
				MessageToast.show("All unsaved changes discarded.");
			}
		},

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function (oEvent) {
			var oArguments = oEvent.getParameter("arguments");
			this._sPath = oArguments.EmployeePath;
			// Don't show two columns when in full screen mode
			if (this.getModel("appView").getProperty("/layout") !== "MidColumnFullScreen") {
				this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			}
			this.getModel().metadataLoaded().then(function () {
				this.getView().bindElement({
					path: "/" + this._sPath
				});
			}.bind(this));
		}
	});
});